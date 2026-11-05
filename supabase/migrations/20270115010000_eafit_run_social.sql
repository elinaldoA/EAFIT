-- EAFIT Run social: título e visibilidade de cada corrida, aplausos dos amigos,
-- feed de corridas e ranking de km da semana entre amigos.
--
-- Quem vê uma corrida: o dono sempre; um amigo (friendships aceita) quando a
-- corrida é 'amigos' e o dono não desligou o compartilhamento
-- (friend_profiles.share_activity). 'privado' = só o dono. O percurso já vem
-- cortado nos primeiros e últimos 200 m pelo app.
-- Aplauso: um por pessoa por corrida, nunca na própria; só pelas funções abaixo.

alter table public.runs
  add column if not exists title text check (title is null or char_length(title) <= 80),
  add column if not exists visibility text not null default 'amigos' check (visibility in ('amigos', 'privado'));

create table if not exists public.run_kudos (
  run_id uuid not null references public.runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (run_id, user_id)
);
create index if not exists run_kudos_user_idx on public.run_kudos (user_id);

-- Sem política: a tabela só é lida e escrita pelas funções (security definer).
alter table public.run_kudos enable row level security;

-- A corrida pode ser vista por p_viewer?
create or replace function public.run_visible_to(p_run public.runs, p_viewer uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_run.user_id = p_viewer
      or (p_run.visibility = 'amigos'
          and public.are_friends(p_viewer, p_run.user_id)
          and coalesce((select fp.share_activity from public.friend_profiles fp where fp.user_id = p_run.user_id), true));
$$;

-- Feed: as minhas corridas e as dos amigos que eu posso ver, mais recentes
-- primeiro. p_before pagina pelo início da corrida.
create or replace function public.run_feed(p_limit int default 20, p_before timestamptz default null)
returns table (
  rf_id uuid, rf_name text, rf_is_me boolean, rf_started_at timestamptz, rf_run_date date,
  rf_duration_s integer, rf_distance_m integer, rf_route jsonb, rf_kind text, rf_title text,
  rf_visibility text, rf_kudos integer, rf_kudoed boolean
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
           exists (select 1 from public.run_kudos k where k.run_id = r.id and k.user_id = uid)
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

-- Aplaude ou tira o aplauso. Devolve o total e se eu aplaudi.
create or replace function public.toggle_run_kudos(p_run uuid)
returns table (rk_kudos integer, rk_kudoed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.runs;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into r from public.runs where id = p_run;
  if not found or not public.run_visible_to(r, uid) then raise exception 'not_found'; end if;
  if r.user_id = uid then raise exception 'own_run'; end if;
  if exists (select 1 from public.run_kudos k where k.run_id = p_run and k.user_id = uid) then
    delete from public.run_kudos k where k.run_id = p_run and k.user_id = uid;
  else
    insert into public.run_kudos (run_id, user_id) values (p_run, uid);
  end if;
  return query
    select (select count(*)::int from public.run_kudos k where k.run_id = p_run),
           exists (select 1 from public.run_kudos k where k.run_id = p_run and k.user_id = uid);
end;
$$;

-- Ranking de km da semana (segunda a domingo, fuso do app) entre mim e os
-- amigos que compartilham atividade. Corridas privadas não entram.
create or replace function public.run_friends_week()
returns table (rw_name text, rw_is_me boolean, rw_meters bigint, rw_runs bigint)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  monday date := today - ((extract(isodow from today)::int) - 1);
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  return query
    with people as (
      select uid as id
      union
      select case when f.requester_id = uid then f.addressee_id else f.requester_id end
      from public.friendships f
      where f.status = 'accepted' and (f.requester_id = uid or f.addressee_id = uid)
    )
    select public.friend_display_name(p.id), p.id = uid,
           coalesce(sum(r.distance_m), 0)::bigint, count(r.id)::bigint
    from people p
    left join public.runs r on r.user_id = p.id and r.run_date >= monday and r.run_date <= today
      and (p.id = uid or r.visibility = 'amigos')
    where p.id = uid
       or coalesce((select fp.share_activity from public.friend_profiles fp where fp.user_id = p.id), true)
    group by p.id
    order by 3 desc, 2 desc;
end;
$$;

revoke all on function public.run_visible_to(public.runs, uuid) from public, anon, authenticated;
revoke all on function public.run_feed(int, timestamptz) from public, anon;
revoke all on function public.toggle_run_kudos(uuid) from public, anon;
revoke all on function public.run_friends_week() from public, anon;
grant execute on function public.run_feed(int, timestamptz) to authenticated;
grant execute on function public.toggle_run_kudos(uuid) to authenticated;
grant execute on function public.run_friends_week() to authenticated;
