-- EAFIT Run: fotos na corrida.
--
-- run_photos: até 4 fotos por corrida, no bucket privado run-photos (pasta
-- <dono>/<corrida>/<arquivo>.jpg). O dono vê e apaga as suas; amigos veem as fotos
-- das corridas com visibilidade 'amigos' de quem não desligou o compartilhamento
-- de atividade (mesma regra do feed), pela função can_view_run_photo.
-- run_feed passa a devolver rf_photos (caminhos das fotos) para o cartão do feed.
--
-- O app funciona antes e depois: sem a tabela, a corrida só não mostra fotos.

create table if not exists public.run_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null references public.runs(id) on delete cascade,
  storage_path text not null check (char_length(storage_path) between 10 and 200),
  created_at timestamptz not null default now()
);
create index if not exists run_photos_run_idx on public.run_photos (run_id, created_at);

alter table public.run_photos enable row level security;

drop policy if exists run_photos_own on public.run_photos;
create policy run_photos_own on public.run_photos
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.runs r where r.id = run_id and r.user_id = auth.uid())
  );

create or replace function public.run_photos_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.run_photos p where p.run_id = new.run_id) >= 4 then
    raise exception 'run_photos_max' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists run_photos_limit on public.run_photos;
create trigger run_photos_limit
  before insert on public.run_photos
  for each row execute function public.run_photos_limit();

insert into storage.buckets (id, name, public)
values ('run-photos', 'run-photos', false)
on conflict (id) do nothing;

-- Quem pode ver o arquivo: o dono, ou amigo do dono quando a corrida é para amigos.
create or replace function public.can_view_run_photo(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  owner uuid;
  rid uuid;
begin
  begin
    owner := (storage.foldername(p_name))[1]::uuid;
    rid := (storage.foldername(p_name))[2]::uuid;
  exception when others then
    return false;
  end;
  if auth.uid() is null then return false; end if;
  if owner = auth.uid() then return true; end if;
  return exists (
    select 1 from public.runs r
    where r.id = rid and r.user_id = owner and r.visibility = 'amigos'
      and public.are_friends(auth.uid(), owner)
      and coalesce((select fp.share_activity from public.friend_profiles fp where fp.user_id = owner), true)
  );
end;
$$;

revoke all on function public.can_view_run_photo(text) from public, anon;
grant execute on function public.can_view_run_photo(text) to authenticated;

drop policy if exists "run_photos_select" on storage.objects;
create policy "run_photos_select"
  on storage.objects for select to authenticated
  using (bucket_id = 'run-photos' and public.can_view_run_photo(name));

drop policy if exists "run_photos_own_insert" on storage.objects;
create policy "run_photos_own_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'run-photos' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "run_photos_own_delete" on storage.objects;
create policy "run_photos_own_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'run-photos' and auth.uid()::text = (storage.foldername(name))[1]);

drop function if exists public.run_feed(int, timestamptz);
create function public.run_feed(p_limit int default 20, p_before timestamptz default null)
returns table (
  rf_id uuid, rf_name text, rf_is_me boolean, rf_started_at timestamptz, rf_run_date date,
  rf_duration_s integer, rf_distance_m integer, rf_route jsonb, rf_kind text, rf_title text,
  rf_visibility text, rf_kudos integer, rf_kudoed boolean, rf_comments integer, rf_weather jsonb,
  rf_splits jsonb, rf_km_elev jsonb, rf_elev_gain_m integer, rf_cadence integer,
  rf_hr jsonb, rf_shoe_name text, rf_tags text[], rf_photos text[]
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  return query
    select r.id, public.friend_display_name(r.user_id), r.user_id = uid, r.started_at, r.run_date,
           r.duration_s, r.distance_m, r.route, r.kind, r.title, r.visibility,
           (select count(*)::int from public.run_kudos k where k.run_id = r.id),
           exists (select 1 from public.run_kudos k where k.run_id = r.id and k.user_id = uid),
           (select count(*)::int from public.run_comments c where c.run_id = r.id
              and (c.user_id = uid or not public.run_comment_blocked(c.user_id))),
           r.weather, r.splits, r.km_elev, r.elev_gain_m::int, r.cadence::int,
           r.hr, (select sh.name from public.run_shoes sh where sh.id = r.shoe_id),
           array(select public.friend_display_name(t) from unnest(r.tagged) t where not public.is_deactivated(t)),
           array(select p.storage_path from public.run_photos p where p.run_id = r.id order by p.created_at)
    from public.runs r
    where (p_before is null or r.started_at < p_before)
      and (r.user_id = uid
           or (r.visibility = 'amigos'
               and public.are_friends(uid, r.user_id)
               and coalesce((select fp.share_activity from public.friend_profiles fp where fp.user_id = r.user_id), true)))
    order by r.started_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

revoke all on function public.run_feed(int, timestamptz) from public, anon;
grant execute on function public.run_feed(int, timestamptz) to authenticated;
