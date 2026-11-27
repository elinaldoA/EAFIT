-- EAFIT Arena, etapa 3: times e chefão semanal.
--
-- TIMES não são uma entidade nova: saem de vínculos que já existem.
--   * time do personal  = alunos com vínculo ativo (trainer_clients), nome = apelido
--     ou primeiro nome do personal;
--   * time do clube     = membros do clube de corrida (run_club_members), nome = o
--     do clube; só com o módulo Run liberado.
--   Quem tem personal e clube pontua nos dois. Só conta quem entrou no ranking da
--   Arena (arena_members): é o consentimento para aparecer.
--   O placar é a MÉDIA de XP por participante na temporada (não a soma), para um
--   clube grande não ganhar só pelo tamanho. Time com menos de min_team
--   participantes (padrão 3, app_settings 'arena') não entra no ranking público:
--   isso evita expor uma pessoa sozinha. Admins ficam fora.
--
-- CHEFÃO SEMANAL é uma meta coletiva (arena_bosses): soma de todo mundo (não-admin)
-- numa semana, em XP de atividade, treinos ou km. Ninguém é exposto, só o total.
-- Bateu a meta, quem contribuiu resgata um bônus de XP (arena_boss_claims, fora do
-- teto diário). A meta nasce proporcional aos usuários ativos da semana anterior
-- (por usuário, com piso). O cron de domingo cria o da semana seguinte a partir de
-- modelos em app_settings 'arena_boss_templates'; chefão de corrida só entra com o
-- Run liberado.

alter table public.arena_xp_events drop constraint if exists arena_xp_events_source_check;
alter table public.arena_xp_events
  add constraint arena_xp_events_source_check check (source in ('workout', 'run', 'mission', 'boss'));

insert into public.app_settings (key, value) values (
  'arena_boss_templates',
  '{"templates": [
    {"title": "O Gigante das Séries", "emoji": "🦍", "metric": "workouts", "per_user": 2, "min_goal": 10, "reward_xp": 40,
     "description": "A comunidade precisa somar treinos concluídos na semana."},
    {"title": "O Dragão do Esforço", "emoji": "🐉", "metric": "xp", "per_user": 150, "min_goal": 600, "reward_xp": 40,
     "description": "Somem XP de treino e corrida até derrubar o dragão."},
    {"title": "A Serpente dos Quilômetros", "emoji": "🐍", "metric": "run_km", "per_user": 8, "min_goal": 40, "reward_xp": 50,
     "description": "Somem quilômetros corridos na semana."}
  ]}'::jsonb
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Chefão
-- ---------------------------------------------------------------------------
create table if not exists public.arena_bosses (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 60),
  emoji text not null default '👹' check (char_length(emoji) between 1 and 8),
  description text check (description is null or char_length(description) <= 200),
  metric text not null check (metric in ('xp', 'workouts', 'run_km')),
  goal numeric(12, 1) not null check (goal > 0),
  starts_on date not null,
  ends_on date not null,
  reward_xp integer not null default 50 check (reward_xp between 1 and 500),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 13)
);
create index if not exists arena_bosses_dates_idx on public.arena_bosses (starts_on, ends_on);

create table if not exists public.arena_boss_claims (
  boss_id uuid not null references public.arena_bosses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  xp integer not null,
  claimed_at timestamptz not null default now(),
  primary key (boss_id, user_id)
);
create index if not exists arena_boss_claims_user_idx on public.arena_boss_claims (user_id);

alter table public.arena_bosses enable row level security;
alter table public.arena_boss_claims enable row level security;

drop policy if exists "arena_bosses read" on public.arena_bosses;
create policy "arena_bosses read" on public.arena_bosses
  for select to authenticated using (active or public.admin_can('content'::text));
drop policy if exists "arena_bosses admin insert" on public.arena_bosses;
create policy "arena_bosses admin insert" on public.arena_bosses
  for insert to authenticated with check (public.admin_can('content'::text));
drop policy if exists "arena_bosses admin update" on public.arena_bosses;
create policy "arena_bosses admin update" on public.arena_bosses
  for update to authenticated using (public.admin_can('content'::text)) with check (public.admin_can('content'::text));
drop policy if exists "arena_bosses admin delete" on public.arena_bosses;
create policy "arena_bosses admin delete" on public.arena_bosses
  for delete to authenticated using (public.admin_can('content'::text));
drop policy if exists "arena_boss_claims own" on public.arena_boss_claims;
create policy "arena_boss_claims own" on public.arena_boss_claims
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.arena_bosses from anon, authenticated;
revoke all on public.arena_boss_claims from anon, authenticated;
grant select, insert, update, delete on public.arena_bosses to authenticated;
grant select on public.arena_boss_claims to authenticated;

-- Quanto já foi feito no chefão: de todos (p_user nulo) ou de uma pessoa.
create or replace function public.arena_boss_value(p_boss uuid, p_user uuid default null)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case b.metric
    when 'xp' then (
      select coalesce(sum(e.xp), 0) from public.arena_xp_events e
      left join public.profiles p on p.id = e.user_id
      where e.source in ('workout', 'run') and e.day between b.starts_on and b.ends_on
        and (p_user is null or e.user_id = p_user) and not coalesce(p.is_admin, false))
    when 'workouts' then (
      select count(*) from public.arena_xp_events e
      left join public.profiles p on p.id = e.user_id
      where e.source = 'workout' and e.day between b.starts_on and b.ends_on
        and (p_user is null or e.user_id = p_user) and not coalesce(p.is_admin, false))
    when 'run_km' then (
      select coalesce(sum(r.distance_m), 0) / 1000.0 from public.arena_xp_events e
      join public.runs r on r.id::text = e.source_ref and r.user_id = e.user_id
      left join public.profiles p on p.id = e.user_id
      where e.source = 'run' and e.day between b.starts_on and b.ends_on
        and (p_user is null or e.user_id = p_user) and not coalesce(p.is_admin, false))
    else 0
  end
  from public.arena_bosses b where b.id = p_boss;
$$;
revoke execute on function public.arena_boss_value(uuid, uuid) from public, anon, authenticated;

create or replace function public.arena_my_boss()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date := public.arena_today();
  run_ok boolean := public.arena_run_released();
  b public.arena_bosses%rowtype;
  prev public.arena_bosses%rowtype;
  val numeric;
  mine numeric;
  parts int;
  defeated boolean;
  claimed boolean;
begin
  if uid is null then return null; end if;
  if not coalesce((public.arena_cfg()->>'enabled')::boolean, false) then
    return jsonb_build_object('enabled', false);
  end if;

  select * into b from public.arena_bosses
    where active and today between starts_on and ends_on
      and (metric <> 'run_km' or run_ok)
    order by starts_on desc limit 1;
  if not found then
    return jsonb_build_object('enabled', true, 'run_released', run_ok, 'boss', null);
  end if;

  val := public.arena_boss_value(b.id);
  mine := public.arena_boss_value(b.id, uid);
  defeated := val >= b.goal;
  claimed := exists (select 1 from public.arena_boss_claims c where c.boss_id = b.id and c.user_id = uid);
  select count(distinct e.user_id) into parts
    from public.arena_xp_events e left join public.profiles p on p.id = e.user_id
    where e.source in ('workout', 'run') and e.day between b.starts_on and b.ends_on and not coalesce(p.is_admin, false);

  select * into prev from public.arena_bosses
    where active and ends_on < b.starts_on and (metric <> 'run_km' or run_ok)
    order by ends_on desc limit 1;

  return jsonb_build_object(
    'enabled', true, 'run_released', run_ok,
    'boss', jsonb_build_object(
      'id', b.id, 'title', b.title, 'emoji', b.emoji, 'description', b.description, 'metric', b.metric,
      'goal', b.goal, 'value', round(val, 1), 'mine', round(mine, 1), 'participants', parts,
      'starts_on', b.starts_on, 'ends_on', b.ends_on, 'reward_xp', b.reward_xp,
      'defeated', defeated, 'claimed', claimed, 'can_claim', defeated and mine > 0 and not claimed),
    'last', case when prev.id is null then null else jsonb_build_object(
      'title', prev.title, 'emoji', prev.emoji, 'defeated', public.arena_boss_value(prev.id) >= prev.goal) end
  );
end;
$$;

create or replace function public.arena_claim_boss(p_boss uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  b public.arena_bosses%rowtype;
  given int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not coalesce((public.arena_cfg()->>'enabled')::boolean, false) then raise exception 'arena_disabled'; end if;

  select * into b from public.arena_bosses where id = p_boss and active;
  if not found then raise exception 'boss_not_found'; end if;
  if b.metric = 'run_km' and not public.arena_run_released() then raise exception 'boss_not_found'; end if;
  if public.arena_boss_value(b.id) < b.goal then raise exception 'boss_not_defeated'; end if;
  if public.arena_boss_value(b.id, uid) <= 0 then raise exception 'boss_no_contribution'; end if;

  insert into public.arena_boss_claims (boss_id, user_id, xp) values (b.id, uid, b.reward_xp)
  on conflict do nothing;
  if not found then raise exception 'boss_already_claimed'; end if;

  given := public.arena_award(uid, 'boss', b.id::text, 'any', b.reward_xp, public.arena_today());
  return jsonb_build_object('xp', given);
end;
$$;

-- Cria o chefão da semana que começa em p_start (padrão: a próxima segunda), a
-- partir dos modelos, girando pelo número da semana. Não duplica. Devolve 1 se criou.
create or replace function public.ops_arena_next_boss(p_start date default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := public.arena_today();
  start date := coalesce(p_start, today + (8 - extract(isodow from today)::int));
  run_ok boolean := public.arena_run_released();
  arr jsonb;
  n int;
  tpl jsonb;
  active_users int;
  goal numeric;
begin
  if exists (select 1 from public.arena_bosses where starts_on = start) then return 0; end if;

  select jsonb_agg(e) into arr
  from jsonb_array_elements(coalesce((select value->'templates' from public.app_settings where key = 'arena_boss_templates'), '[]'::jsonb)) e
  where (e->>'metric') <> 'run_km' or run_ok;
  n := coalesce(jsonb_array_length(arr), 0);
  if n = 0 then return 0; end if;
  tpl := arr -> (extract(week from start)::int % n);

  select count(distinct e.user_id) into active_users
    from public.arena_xp_events e left join public.profiles p on p.id = e.user_id
    where e.source in ('workout', 'run') and e.day >= today - 7 and not coalesce(p.is_admin, false);
  goal := greatest((tpl->>'min_goal')::numeric, ceil((tpl->>'per_user')::numeric * greatest(active_users, 5)));

  insert into public.arena_bosses (title, emoji, description, metric, goal, starts_on, ends_on, reward_xp)
  values (tpl->>'title', coalesce(tpl->>'emoji', '👹'), tpl->>'description', tpl->>'metric', goal,
          start, start + 6, coalesce((tpl->>'reward_xp')::int, 50));
  return 1;
end;
$$;
revoke execute on function public.ops_arena_next_boss(date) from public, anon, authenticated;

revoke execute on function public.arena_my_boss() from public, anon;
revoke execute on function public.arena_claim_boss(uuid) from public, anon;
grant execute on function public.arena_my_boss() to authenticated;
grant execute on function public.arena_claim_boss(uuid) to authenticated;

-- Domingo às 9h de Brasília (12h UTC): prepara o chefão da semana que vem.
select cron.schedule('arena-next-boss', '0 12 * * 0', $$ select public.ops_arena_next_boss(); $$);

-- ---------------------------------------------------------------------------
-- Times
-- ---------------------------------------------------------------------------
create or replace function public.arena_team_members()
returns table (tm_kind text, tm_key uuid, tm_user uuid)
language sql
stable
security definer
set search_path = public
as $$
  select 'trainer'::text, tc.trainer_id, tc.client_id
  from public.trainer_clients tc where tc.status = 'active'
  union all
  select 'club'::text, m.club_id, m.user_id
  from public.run_club_members m where public.arena_run_released();
$$;
revoke execute on function public.arena_team_members() from public, anon, authenticated;

create or replace function public.arena_team_name(p_kind text, p_key uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case p_kind
    when 'trainer' then public.league_display_name(p_key)
    else (select c.name from public.run_clubs c where c.id = p_key)
  end;
$$;
revoke execute on function public.arena_team_name(text, uuid) from public, anon, authenticated;

-- Classificação dos times de um tipo na temporada: só quem entrou no ranking,
-- média de XP por participante, times com participantes suficientes e algum XP.
create or replace function public.arena_team_standings(p_season uuid, p_kind text)
returns table (tt_key uuid, tt_xp bigint, tt_members int, tt_avg int, tt_position int)
language sql
stable
security definer
set search_path = public
as $$
  with per_user as (
    select tm.tm_key, tm.tm_user, coalesce(sum(e.xp), 0)::bigint as x
    from public.arena_team_members() tm
    join public.arena_members am on am.user_id = tm.tm_user
    join public.arena_seasons s on s.id = p_season
    left join public.profiles p on p.id = tm.tm_user
    left join public.arena_xp_events e
      on e.user_id = tm.tm_user and e.day between s.starts_on and s.ends_on
    where tm.tm_kind = p_kind and not coalesce(p.is_admin, false)
    group by tm.tm_key, tm.tm_user
  ),
  team as (
    select tm_key, sum(x)::bigint as txp, count(*)::int as n
    from per_user group by tm_key
    having count(*) >= coalesce((public.arena_cfg()->>'min_team')::int, 3) and sum(x) > 0
  )
  select tm_key, txp, n, round(txp::numeric / n)::int,
         (rank() over (order by txp::numeric / n desc))::int
  from team;
$$;
revoke execute on function public.arena_team_standings(uuid, text) from public, anon, authenticated;

-- Os times da pessoa na temporada, cada um com a posição e os 5 primeiros do tipo.
create or replace function public.arena_my_teams()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  today date := public.arena_today();
  run_ok boolean := public.arena_run_released();
  cur public.arena_seasons%rowtype;
  t record;
  row_ record;
  el jsonb;
  out jsonb := '[]'::jsonb;
  parts int;
begin
  if uid is null then return null; end if;
  if not coalesce((public.arena_cfg()->>'enabled')::boolean, false) then
    return jsonb_build_object('enabled', false);
  end if;
  select * into cur from public.arena_seasons
    where active and today between starts_on and ends_on order by starts_on desc limit 1;
  if not found then return jsonb_build_object('enabled', true, 'run_released', run_ok, 'teams', '[]'::jsonb); end if;
  if not exists (select 1 from public.arena_members where user_id = uid) then
    return jsonb_build_object('enabled', true, 'run_released', run_ok, 'member', false, 'teams', '[]'::jsonb);
  end if;

  for t in
    select tm.tm_kind, tm.tm_key from public.arena_team_members() tm where tm.tm_user = uid
    order by tm.tm_kind, tm.tm_key
  loop
    select count(*)::int into parts
      from public.arena_team_members() tm join public.arena_members am on am.user_id = tm.tm_user
      left join public.profiles p on p.id = tm.tm_user
      where tm.tm_kind = t.tm_kind and tm.tm_key = t.tm_key and not coalesce(p.is_admin, false);

    with s as materialized (select * from public.arena_team_standings(cur.id, t.tm_kind)),
         mine as (select * from s where tt_key = t.tm_key)
    select jsonb_build_object(
      'kind', t.tm_kind,
      'name', public.arena_team_name(t.tm_kind, t.tm_key),
      'members', parts,
      'min_team', coalesce((public.arena_cfg()->>'min_team')::int, 3),
      'listed', exists (select 1 from mine),
      'xp', (select tt_xp from mine),
      'avg', (select tt_avg from mine),
      'position', (select tt_position from mine),
      'size', (select count(*) from s),
      'top', coalesce((
        select jsonb_agg(jsonb_build_object('name', public.arena_team_name(t.tm_kind, x.tt_key), 'avg', x.tt_avg,
                                            'members', x.tt_members, 'position', x.tt_position, 'me', x.tt_key = t.tm_key)
                         order by x.tt_position, x.tt_key)
        from (select * from s order by tt_position, tt_key limit 5) x
      ), '[]'::jsonb)
    ) into el;
    out := out || jsonb_build_array(el);
  end loop;

  return jsonb_build_object('enabled', true, 'run_released', run_ok, 'member', true,
    'season', jsonb_build_object('title', cur.title, 'ends_on', cur.ends_on), 'teams', out);
end;
$$;
revoke execute on function public.arena_my_teams() from public, anon;
grant execute on function public.arena_my_teams() to authenticated;

-- Já deixa o chefão da próxima semana pronto.
select public.ops_arena_next_boss();
