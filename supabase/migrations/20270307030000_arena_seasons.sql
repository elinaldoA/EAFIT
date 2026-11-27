-- EAFIT Arena, etapa 2: temporadas e ranking.
--
-- Uma temporada é uma janela de datas (arena_seasons). O ranking é a soma do
-- XP ganho dentro da janela (arena_xp_events.day), então não há placar separado
-- para manter: apagou um treino, o XP some do ranking junto.
--   * Geral: todo o XP (treino, corrida e missões).
--   * Gym / Run: só o XP de treino / de corrida (missões, que são module 'any',
--     contam só no Geral). O Run só aparece com o módulo liberado.
--   * Só entra quem toca em "Participar do ranking" (arena_members), como na
--     liga mensal; no ranking aparece apelido ou primeiro nome. Admins ficam de fora.
--   * Só pontua quem tem XP na temporada (XP > 0). Empate divide a posição.
-- No fim da temporada, o cron diário fecha as que já acabaram: grava o resultado
-- de todos em arena_season_results e dá a medalha arena_<slug>_<posição> aos 3
-- primeiros do Geral (em achievements), com aviso na caixa do app. Rodar de novo
-- não duplica nada.
-- O slug não leva "_" (o id da medalha é arena_<slug>_<posição>).
--
-- Primeira temporada: dezembro/2026 a fevereiro/2027, começando junto com o Run.

create table if not exists public.arena_seasons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,30}$'),
  title text not null check (char_length(btrim(title)) between 3 and 60),
  starts_on date not null,
  ends_on date not null,
  active boolean not null default true,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 190)
);
create index if not exists arena_seasons_dates_idx on public.arena_seasons (starts_on, ends_on);

create table if not exists public.arena_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now()
);

create table if not exists public.arena_season_results (
  season_id uuid not null references public.arena_seasons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  xp bigint not null,
  position integer not null,
  primary key (season_id, user_id)
);
create index if not exists arena_season_results_user_idx on public.arena_season_results (user_id);

alter table public.arena_seasons enable row level security;
alter table public.arena_members enable row level security;
alter table public.arena_season_results enable row level security;

drop policy if exists "arena_seasons read" on public.arena_seasons;
create policy "arena_seasons read" on public.arena_seasons
  for select to authenticated using (active or public.admin_can('content'::text));
drop policy if exists "arena_seasons admin insert" on public.arena_seasons;
create policy "arena_seasons admin insert" on public.arena_seasons
  for insert to authenticated with check (public.admin_can('content'::text));
drop policy if exists "arena_seasons admin update" on public.arena_seasons;
create policy "arena_seasons admin update" on public.arena_seasons
  for update to authenticated using (public.admin_can('content'::text)) with check (public.admin_can('content'::text));
drop policy if exists "arena_seasons admin delete" on public.arena_seasons;
create policy "arena_seasons admin delete" on public.arena_seasons
  for delete to authenticated using (public.admin_can('content'::text));

drop policy if exists "arena_members own" on public.arena_members;
create policy "arena_members own" on public.arena_members
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
drop policy if exists "arena_season_results own" on public.arena_season_results;
create policy "arena_season_results own" on public.arena_season_results
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());

revoke all on public.arena_seasons from anon, authenticated;
revoke all on public.arena_members from anon, authenticated;
revoke all on public.arena_season_results from anon, authenticated;
grant select, insert, update, delete on public.arena_seasons to authenticated;
grant select on public.arena_members, public.arena_season_results to authenticated;

-- ---------------------------------------------------------------------------
-- Classificação de uma temporada: p_module 'all' | 'gym' | 'run'.
-- ---------------------------------------------------------------------------
create or replace function public.arena_season_standings(p_season uuid, p_module text)
returns table (st_user uuid, st_xp bigint, st_position int)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id,
         sum(e.xp)::bigint,
         (rank() over (order by sum(e.xp) desc))::int
  from public.arena_seasons s
  join public.arena_members m on true
  join public.arena_xp_events e
    on e.user_id = m.user_id and e.day between s.starts_on and s.ends_on
   and (p_module = 'all' or e.module = p_module)
  left join public.profiles p on p.id = m.user_id
  where s.id = p_season and not coalesce(p.is_admin, false)
  group by m.user_id;
$$;
revoke execute on function public.arena_season_standings(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- O que a tela do ranking mostra.
-- ---------------------------------------------------------------------------
create or replace function public.arena_my_ranking(p_module text default 'all')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date := public.arena_today();
  mod text := case when p_module in ('gym', 'run') then p_module else 'all' end;
  run_ok boolean := public.arena_run_released();
  cur public.arena_seasons%rowtype;
  nxt public.arena_seasons%rowtype;
  base jsonb;
  out jsonb;
begin
  if uid is null then return null; end if;
  if not coalesce((public.arena_cfg()->>'enabled')::boolean, false) then
    return jsonb_build_object('enabled', false);
  end if;
  -- Ranking de corrida só existe com o módulo liberado.
  if mod = 'run' and not run_ok then mod := 'all'; end if;

  select * into cur from public.arena_seasons
    where active and today between starts_on and ends_on order by starts_on desc limit 1;
  if not found then
    select * into nxt from public.arena_seasons where active and starts_on > today order by starts_on limit 1;
    return jsonb_build_object('enabled', true, 'run_released', run_ok, 'season', null,
      'next', case when nxt.id is null then null
               else jsonb_build_object('title', nxt.title, 'starts_on', nxt.starts_on) end);
  end if;

  base := jsonb_build_object('enabled', true, 'run_released', run_ok, 'module', mod,
    'season', jsonb_build_object('slug', cur.slug, 'title', cur.title, 'starts_on', cur.starts_on, 'ends_on', cur.ends_on));

  if not exists (select 1 from public.arena_members where user_id = uid) then
    return base || jsonb_build_object('member', false,
      'members', (select count(*) from public.arena_members));
  end if;

  with s as materialized (select * from public.arena_season_standings(cur.id, mod)),
       mine as (select * from s where st_user = uid)
  select base || jsonb_build_object(
    'member', true,
    'xp', coalesce((select st_xp from mine), 0),
    'position', (select st_position from mine),
    'size', (select count(*) from s),
    'top', coalesce((
      select jsonb_agg(jsonb_build_object('name', public.league_display_name(t.st_user), 'xp', t.st_xp,
                                          'position', t.st_position, 'me', t.st_user = uid)
                       order by t.st_position, t.st_user)
      from (select * from s order by st_position, st_user limit 10) t
    ), '[]'::jsonb),
    'last', (select jsonb_build_object('title', z.title, 'position', r.position, 'xp', r.xp)
             from public.arena_season_results r join public.arena_seasons z on z.id = r.season_id
             where r.user_id = uid order by z.ends_on desc limit 1)
  ) into out;
  return out;
end;
$$;

create or replace function public.join_arena_ranking()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authorized'; end if;
  insert into public.arena_members (user_id) values (auth.uid()) on conflict do nothing;
end;
$$;

create or replace function public.leave_arena_ranking()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.arena_members where user_id = auth.uid();
end;
$$;

revoke execute on function public.arena_my_ranking(text) from public, anon;
revoke execute on function public.join_arena_ranking() from public, anon;
revoke execute on function public.leave_arena_ranking() from public, anon;
grant execute on function public.arena_my_ranking(text) to authenticated;
grant execute on function public.join_arena_ranking() to authenticated;
grant execute on function public.leave_arena_ranking() to authenticated;

-- ---------------------------------------------------------------------------
-- Fechamento: temporadas que já acabaram. Pode rodar de novo sem duplicar nada.
-- Devolve quantas medalhas foram dadas.
-- ---------------------------------------------------------------------------
create or replace function public.ops_close_arena_season(p_slug text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  made int := 0;
  n int;
begin
  for s in
    select * from public.arena_seasons
    where active and closed_at is null and ends_on < public.arena_today()
      and (p_slug is null or slug = p_slug)
  loop
    insert into public.arena_season_results (season_id, user_id, xp, position)
    select s.id, st.st_user, st.st_xp, st.st_position
    from public.arena_season_standings(s.id, 'all') st
    on conflict (season_id, user_id) do update set xp = excluded.xp, position = excluded.position;

    with winners as (
      select r.user_id, r.position from public.arena_season_results r
      where r.season_id = s.id and r.position <= 3
    ),
    ins as (
      insert into public.achievements (user_id, badge_id)
      select w.user_id, format('arena_%s_%s', s.slug, w.position) from winners w
      on conflict (user_id, badge_id) do nothing
      returning user_id, badge_id
    ),
    note as (
      insert into public.user_notifications (user_id, kind, title, body)
      select ins.user_id, 'aviso', '🏆 Medalha da Arena',
             format('Você ficou em %sº na %s. A medalha já está nas suas conquistas.',
                    split_part(ins.badge_id, '_', 3), s.title)
      from ins
      returning 1
    )
    select count(*) into n from note;
    made := made + n;

    update public.arena_seasons set closed_at = now() where id = s.id;
  end loop;
  return made;
end;
$$;
revoke execute on function public.ops_close_arena_season(text) from public, anon, authenticated;

-- Todo dia às 00h05 de Brasília (03h05 UTC): só age quando alguma temporada acabou.
select cron.schedule('close-arena-season', '5 3 * * *', $$ select public.ops_close_arena_season(); $$);

-- ---------------------------------------------------------------------------
-- Temporada 1
-- ---------------------------------------------------------------------------
insert into public.arena_seasons (slug, title, starts_on, ends_on)
values ('temporada-1', 'Temporada 1', '2026-12-01', '2027-02-28')
on conflict (slug) do nothing;
