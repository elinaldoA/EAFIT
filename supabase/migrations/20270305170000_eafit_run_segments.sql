-- EAFIT Run: segmentos e placar.
--
-- Segmento = um trecho de percurso (largada, chegada e o desenho entre elas) criado a
-- partir de uma corrida. Cada passagem de uma corrida pelo trecho vira um esforço
-- (segment_efforts, calculado no app a partir do percurso com tempo por ponto). O
-- placar compara o melhor esforço de cada pessoa, entre a própria pessoa e os amigos.
--
-- Privacidade: o segmento nasce 'privado' (só o dono vê e usa). Quem o marca como
-- 'amigos' mostra a largada e a chegada para os amigos, por isso o app avisa antes.
-- Amigos só aparecem no placar com a corrida 'amigos' e o compartilhamento de
-- atividade ligado (mesma regra do feed).
--
-- O app funciona antes e depois: sem as tabelas, a seção de segmentos fica vazia.

create table if not exists public.segments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  route jsonb not null check (jsonb_typeof(route) = 'array' and jsonb_array_length(route) between 2 and 400),
  distance_m integer not null check (distance_m between 100 and 100000),
  visibility text not null default 'privado' check (visibility in ('privado', 'amigos')),
  created_at timestamptz not null default now()
);
create index if not exists segments_user_idx on public.segments (user_id);

create table if not exists public.segment_efforts (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references public.segments(id) on delete cascade,
  run_id uuid not null references public.runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seconds integer not null check (seconds between 5 and 86400),
  run_date date not null,
  created_at timestamptz not null default now(),
  unique (segment_id, run_id)
);
create index if not exists segment_efforts_segment_idx on public.segment_efforts (segment_id, seconds);
create index if not exists segment_efforts_user_idx on public.segment_efforts (user_id);

-- Auxiliar para a política acima: o dono do segmento é amigo de quem está logado?
create or replace function public.run_segment_is_friend(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.are_friends(auth.uid(), p_owner);
$$;

revoke all on function public.run_segment_is_friend(uuid) from public, anon;
grant execute on function public.run_segment_is_friend(uuid) to authenticated;

alter table public.segments enable row level security;
alter table public.segment_efforts enable row level security;

drop policy if exists segments_own on public.segments;
create policy segments_own on public.segments
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Esforço: só o dono lê, grava e apaga os seus (os dos amigos chegam pelo placar).
drop policy if exists segment_efforts_own on public.segment_efforts;
create policy segment_efforts_own on public.segment_efforts
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.runs r where r.id = run_id and r.user_id = auth.uid())
    and exists (
      select 1 from public.segments s
      where s.id = segment_id and (s.user_id = auth.uid()
        or (s.visibility = 'amigos' and public.run_segment_is_friend(s.user_id)))
    )
  );

-- Segmentos que a pessoa pode usar: os dela e os dos amigos marcados como 'amigos'.
create or replace function public.my_segments()
returns table (
  sg_id uuid, sg_name text, sg_route jsonb, sg_distance_m integer, sg_visibility text,
  sg_is_mine boolean, sg_owner text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select s.id, s.name, s.route, s.distance_m, s.visibility, s.user_id = auth.uid(),
         case when s.user_id = auth.uid() then null else public.friend_display_name(s.user_id) end
  from public.segments s
  where auth.uid() is not null
    and (s.user_id = auth.uid()
         or (s.visibility = 'amigos' and public.are_friends(auth.uid(), s.user_id) and not public.is_deactivated(s.user_id)))
  order by s.created_at desc;
$$;

revoke all on function public.my_segments() from public, anon;
grant execute on function public.my_segments() to authenticated;

-- Placar: o melhor esforço de cada pessoa (a própria e os amigos), do mais rápido ao
-- mais lento, até 20. Vazio se o segmento não é visível para quem pergunta.
create or replace function public.segment_leaderboard(p_segment uuid)
returns table (sl_name text, sl_is_me boolean, sl_seconds integer, sl_date date, sl_rank integer)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  owner uuid;
  vis text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select s.user_id, s.visibility into owner, vis from public.segments s where s.id = p_segment;
  if owner is null then return; end if;
  if owner <> uid and not (vis = 'amigos' and public.are_friends(uid, owner)) then return; end if;
  return query
    with best as (
      select distinct on (e.user_id) e.user_id, e.seconds, e.run_date
      from public.segment_efforts e
      join public.runs r on r.id = e.run_id
      where e.segment_id = p_segment
        and not public.is_deactivated(e.user_id)
        and (e.user_id = uid
             or (r.visibility = 'amigos'
                 and public.are_friends(uid, e.user_id)
                 and coalesce((select fp.share_activity from public.friend_profiles fp where fp.user_id = e.user_id), true)))
      order by e.user_id, e.seconds asc, e.run_date asc
    )
    select case when b.user_id = uid then null else public.friend_display_name(b.user_id) end,
           b.user_id = uid, b.seconds, b.run_date,
           (rank() over (order by b.seconds asc))::int
    from best b
    order by b.seconds asc
    limit 20;
end;
$$;

revoke all on function public.segment_leaderboard(uuid) from public, anon;
grant execute on function public.segment_leaderboard(uuid) to authenticated;
