-- EAFIT Arena, etapa 1: XP, nível, sequência e missões. Camada única para os
-- módulos Gym e Run: o mesmo personagem soma XP de treino (workouts) e de
-- corrida (runs).
--
-- Princípios
--   * O servidor decide tudo. O app só lê (arena_my) e resgata missão
--     (arena_claim_mission). As tabelas não têm policy de escrita.
--   * XP vem de um livro-razão (arena_xp_events), idempotente por
--     (user_id, source, source_ref): salvar o mesmo treino/corrida duas vezes
--     (fila offline, reenvio) nunca soma duas vezes.
--   * arena_profiles é cache: xp, nível e sequência são sempre recalculados do
--     livro-razão (arena_recalc), então apagar um treino desfaz o XP dele.
--   * Só conta atividade depois que a Arena é ligada (app_settings 'arena'
--     {enabled}); não há retroativo, para o ranking largar parelho.
--   * Falha na Arena nunca impede salvar treino ou corrida (triggers com
--     exception handler).
--   * Anti-fraude: teto diário de XP de atividade, corrida abaixo do mínimo ou
--     rápida demais não rende XP. Missões ficam fora do teto.
--   * Dia = horário de Brasília, como training_days() e a liga mensal.
--
-- Reaproveita sem alterar: workouts, exercise_sets, runs, app_settings,
-- user_notifications. Conquistas continuam em achievements (etapa 2 grava
-- badge_id arena_nivel_N lá). Liga mensal, desafios e clubes seguem como estão.
--
-- Curva de nível: nível = 1 + floor(sqrt(xp / 50)). Nível 2 com 50 XP, 5 com
-- 800, 10 com 4.050, 20 com 18.050.
--
-- Etapas seguintes (não estão aqui):
--   2  arena_seasons (slug, título, starts_on, ends_on) + ranking por soma de
--      arena_xp_events.day na janela, geral e por módulo, só para quem entrou
--      (arena_members, como league_members) e fora admin; badges de nível.
--   3  times: arena_teams ligado a run_clubs e ao personal (trainer), placar =
--      soma do XP dos membros; chefão semanal = meta coletiva (arena_bosses +
--      arena_boss_progress) sobre arena_xp_events.
--   4  recompensas reais (arena_rewards, arena_reward_claims) com parceiros.

-- ---------------------------------------------------------------------------
-- Configuração (ajustável no painel sem publicar o app)
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value) values (
  'arena',
  '{"enabled": false,
    "daily_cap": 300,
    "workout": {"base": 50, "per_set": 2, "max_sets": 30},
    "run": {"base": 20, "per_km": 10, "max_km_xp": 150, "gps_bonus": 10,
            "min_m": 500, "min_s": 120, "max_speed_ms": 8.3}}'::jsonb
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table if not exists public.arena_xp_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('workout', 'run', 'mission')),
  source_ref text not null check (char_length(source_ref) between 1 and 80),
  module text not null check (module in ('gym', 'run', 'any')),
  xp integer not null check (xp > 0 and xp <= 1000),
  day date not null,
  created_at timestamptz not null default now(),
  unique (user_id, source, source_ref)
);
create index if not exists arena_xp_events_user_day_idx on public.arena_xp_events (user_id, day);
create index if not exists arena_xp_events_day_idx on public.arena_xp_events (day);

create table if not exists public.arena_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  xp_total bigint not null default 0,
  level integer not null default 1,
  streak integer not null default 0,
  best_streak integer not null default 0,
  last_day date,
  updated_at timestamptz not null default now()
);

-- goals: { métrica: meta }. Métricas: workouts, runs, run_km, active_days.
-- Mais de uma métrica = todas precisam ser batidas (missão híbrida Gym + Run).
create table if not exists public.arena_missions (
  id text primary key check (id ~ '^[a-z0-9_]{3,40}$'),
  title text not null check (char_length(btrim(title)) between 3 and 80),
  description text check (description is null or char_length(description) <= 200),
  period text not null check (period in ('daily', 'weekly')),
  module text not null default 'any' check (module in ('gym', 'run', 'any')),
  goals jsonb not null check (jsonb_typeof(goals) = 'object' and goals <> '{}'::jsonb),
  xp integer not null check (xp between 1 and 1000),
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.arena_mission_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_id text not null references public.arena_missions(id) on delete cascade,
  period_start date not null,
  xp integer not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, mission_id, period_start)
);

-- ---------------------------------------------------------------------------
-- RLS: o app só lê o que é dele; escrita só pelas funções (security definer).
-- ---------------------------------------------------------------------------
alter table public.arena_xp_events enable row level security;
alter table public.arena_profiles enable row level security;
alter table public.arena_missions enable row level security;
alter table public.arena_mission_claims enable row level security;

drop policy if exists "arena_xp_events own" on public.arena_xp_events;
create policy "arena_xp_events own" on public.arena_xp_events
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "arena_profiles own" on public.arena_profiles;
create policy "arena_profiles own" on public.arena_profiles
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "arena_mission_claims own" on public.arena_mission_claims;
create policy "arena_mission_claims own" on public.arena_mission_claims
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "arena_missions read" on public.arena_missions;
create policy "arena_missions read" on public.arena_missions
  for select to authenticated using (active or public.admin_can('content'::text));
drop policy if exists "arena_missions admin insert" on public.arena_missions;
create policy "arena_missions admin insert" on public.arena_missions
  for insert to authenticated with check (public.admin_can('content'::text));
drop policy if exists "arena_missions admin update" on public.arena_missions;
create policy "arena_missions admin update" on public.arena_missions
  for update to authenticated using (public.admin_can('content'::text)) with check (public.admin_can('content'::text));
drop policy if exists "arena_missions admin delete" on public.arena_missions;
create policy "arena_missions admin delete" on public.arena_missions
  for delete to authenticated using (public.admin_can('content'::text));

revoke all on public.arena_xp_events from anon, authenticated;
revoke all on public.arena_profiles from anon, authenticated;
revoke all on public.arena_mission_claims from anon, authenticated;
revoke all on public.arena_missions from anon, authenticated;
grant select on public.arena_xp_events, public.arena_profiles, public.arena_mission_claims to authenticated;
grant select, insert, update, delete on public.arena_missions to authenticated;

-- ---------------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------------
create or replace function public.arena_cfg()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value from public.app_settings where key = 'arena'), '{"enabled": false}'::jsonb);
$$;

create or replace function public.arena_level(p_xp bigint)
returns integer
language sql
immutable
as $$
  select 1 + floor(sqrt(greatest(p_xp, 0) / 50.0))::int;
$$;

create or replace function public.arena_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- Recalcula o cache do usuário a partir do livro-razão. A sequência conta dias
-- seguidos com treino ou corrida; está viva se o último dia é hoje ou ontem.
create or replace function public.arena_recalc(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := public.arena_today();
  v_xp bigint;
  v_best int;
  v_cur int;
  v_last date;
begin
  select coalesce(sum(xp), 0) into v_xp from public.arena_xp_events where user_id = p_user;

  with d as (
    select distinct day from public.arena_xp_events
    where user_id = p_user and source in ('workout', 'run')
  ),
  g as (select day, day - (row_number() over (order by day))::int as grp from d),
  isl as (select grp, count(*)::int as n, max(day) as last_day from g group by grp)
  select coalesce(max(n), 0),
         coalesce((select n from isl where last_day >= today - 1 order by last_day desc limit 1), 0),
         max(last_day)
    into v_best, v_cur, v_last
  from isl;

  insert into public.arena_profiles (user_id, xp_total, level, streak, best_streak, last_day, updated_at)
  values (p_user, v_xp, public.arena_level(v_xp), v_cur, v_best, v_last, now())
  on conflict (user_id) do update
    set xp_total = excluded.xp_total, level = excluded.level, streak = excluded.streak,
        best_streak = excluded.best_streak, last_day = excluded.last_day, updated_at = now();
end;
$$;

-- Concede XP. Atividade (treino/corrida) respeita o teto diário; missão não.
-- Idempotente. Devolve o XP de fato concedido (0 se repetido ou sem saldo).
create or replace function public.arena_award(
  p_user uuid, p_source text, p_ref text, p_module text, p_xp int, p_day date
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg jsonb := public.arena_cfg();
  cap int := coalesce((cfg->>'daily_cap')::int, 300);
  used int;
  give int := p_xp;
  old_level int;
  new_level int;
begin
  if not coalesce((cfg->>'enabled')::boolean, false) then return 0; end if;
  if p_xp is null or p_xp <= 0 then return 0; end if;

  if p_source in ('workout', 'run') then
    select coalesce(sum(xp), 0) into used from public.arena_xp_events
    where user_id = p_user and day = p_day and source in ('workout', 'run')
      and not (source = p_source and source_ref = p_ref);
    give := least(p_xp, cap - used);
    if give <= 0 then return 0; end if;
  end if;

  select coalesce(level, 1) into old_level from public.arena_profiles where user_id = p_user;

  insert into public.arena_xp_events (user_id, source, source_ref, module, xp, day)
  values (p_user, p_source, p_ref, p_module, give, p_day)
  on conflict (user_id, source, source_ref) do nothing;
  if not found then return 0; end if;

  perform public.arena_recalc(p_user);

  select level into new_level from public.arena_profiles where user_id = p_user;
  if new_level > coalesce(old_level, 1) then
    insert into public.user_notifications (user_id, kind, title, body)
    values (p_user, 'aviso', '⭐ Subiu de nível',
            format('Você chegou ao nível %s da Arena. Continue assim!', new_level));
  end if;
  return give;
end;
$$;

create or replace function public.arena_unaward(p_user uuid, p_source text, p_ref text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.arena_xp_events where user_id = p_user and source = p_source and source_ref = p_ref;
  if found then perform public.arena_recalc(p_user); end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Gatilhos: treino concluído (Gym) e corrida gravada (Run)
-- ---------------------------------------------------------------------------
create or replace function public.arena_on_workout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  w jsonb := public.arena_cfg()->'workout';
  sets int;
  xp int;
  d date;
begin
  begin
    if coalesce(new.completed, false) or new.finished_at is not null then
      select count(*) into sets from public.exercise_sets s where s.workout_id = new.id and s.completed;
      xp := coalesce((w->>'base')::int, 50)
          + least(sets, coalesce((w->>'max_sets')::int, 30)) * coalesce((w->>'per_set')::int, 2);
      d := coalesce((new.started_at at time zone 'America/Sao_Paulo')::date, new.workout_date);
      perform public.arena_award(new.user_id, 'workout', new.id::text, 'gym', xp, d);
    end if;
  exception when others then
    null; -- a Arena nunca pode impedir o treino de ser salvo
  end;
  return new;
end;
$$;

create or replace function public.arena_on_workout_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.arena_unaward(old.user_id, 'workout', old.id::text);
  exception when others then
    null;
  end;
  return old;
end;
$$;

create or replace function public.arena_on_run()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb := public.arena_cfg()->'run';
  xp int;
begin
  begin
    -- Corrida curta demais, rápida demais (carro/bicicleta) ou sem tempo real não rende XP.
    if new.distance_m >= coalesce((r->>'min_m')::int, 500)
       and new.duration_s >= coalesce((r->>'min_s')::int, 120)
       and new.distance_m::numeric / new.duration_s <= coalesce((r->>'max_speed_ms')::numeric, 8.3) then
      xp := coalesce((r->>'base')::int, 20)
          + least((new.distance_m / 1000) * coalesce((r->>'per_km')::int, 10), coalesce((r->>'max_km_xp')::int, 150))
          + case when new.gps then coalesce((r->>'gps_bonus')::int, 10) else 0 end;
      perform public.arena_award(new.user_id, 'run', new.id::text, 'run', xp, new.run_date);
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;

create or replace function public.arena_on_run_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.arena_unaward(old.user_id, 'run', old.id::text);
  exception when others then
    null;
  end;
  return old;
end;
$$;

drop trigger if exists arena_workout_award on public.workouts;
create trigger arena_workout_award
  after insert or update of completed, finished_at on public.workouts
  for each row execute function public.arena_on_workout();

drop trigger if exists arena_workout_unaward on public.workouts;
create trigger arena_workout_unaward
  after delete on public.workouts
  for each row execute function public.arena_on_workout_delete();

drop trigger if exists arena_run_award on public.runs;
create trigger arena_run_award
  after insert on public.runs
  for each row execute function public.arena_on_run();

drop trigger if exists arena_run_unaward on public.runs;
create trigger arena_run_unaward
  after delete on public.runs
  for each row execute function public.arena_on_run_delete();

-- ---------------------------------------------------------------------------
-- Missões
-- ---------------------------------------------------------------------------
-- Valor de uma métrica na janela [p_from, p_to], só com atividade que rendeu XP
-- (assim missão e ranking usam a mesma régua e o teto/anti-fraude valem para os dois).
create or replace function public.arena_metric(p_user uuid, p_metric text, p_from date, p_to date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case p_metric
    when 'workouts' then (select count(*) from public.arena_xp_events e
                          where e.user_id = p_user and e.source = 'workout' and e.day between p_from and p_to)
    when 'runs' then (select count(*) from public.arena_xp_events e
                      where e.user_id = p_user and e.source = 'run' and e.day between p_from and p_to)
    when 'run_km' then (select coalesce(sum(r.distance_m), 0) / 1000.0
                        from public.arena_xp_events e
                        join public.runs r on r.id::text = e.source_ref and r.user_id = e.user_id
                        where e.user_id = p_user and e.source = 'run' and e.day between p_from and p_to)
    when 'active_days' then (select count(distinct e.day) from public.arena_xp_events e
                             where e.user_id = p_user and e.source in ('workout', 'run') and e.day between p_from and p_to)
    else 0
  end;
$$;

create or replace function public.arena_period_start(p_period text, p_day date default public.arena_today())
returns date
language sql
immutable
as $$
  select case p_period when 'weekly' then p_day - (extract(isodow from p_day)::int - 1) else p_day end;
$$;

create or replace function public.arena_period_end(p_period text, p_day date default public.arena_today())
returns date
language sql
immutable
as $$
  select case p_period when 'weekly' then p_day - (extract(isodow from p_day)::int - 1) + 6 else p_day end;
$$;

-- Progresso de uma missão: [{metric, have, target}] e se bate a meta toda.
create or replace function public.arena_mission_progress(p_user uuid, p_goals jsonb, p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'metric', g.key,
           'have', round(public.arena_metric(p_user, g.key, p_from, p_to), 1),
           'target', g.value::numeric)), '[]'::jsonb)
  from jsonb_each_text(p_goals) g;
$$;

create or replace function public.arena_claim_mission(p_mission text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  m public.arena_missions%rowtype;
  p_from date;
  p_to date;
  ok boolean;
  given int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not coalesce((public.arena_cfg()->>'enabled')::boolean, false) then raise exception 'arena_disabled'; end if;

  select * into m from public.arena_missions where id = p_mission and active;
  if not found then raise exception 'mission_not_found'; end if;

  p_from := public.arena_period_start(m.period);
  p_to := public.arena_period_end(m.period);

  select coalesce(bool_and(public.arena_metric(uid, g.key, p_from, p_to) >= g.value::numeric), false)
    into ok from jsonb_each_text(m.goals) g;
  if not ok then raise exception 'mission_not_done'; end if;

  insert into public.arena_mission_claims (user_id, mission_id, period_start, xp)
  values (uid, m.id, p_from, m.xp)
  on conflict do nothing;
  if not found then raise exception 'mission_already_claimed'; end if;

  given := public.arena_award(uid, 'mission', m.id || ':' || p_from::text, 'any', m.xp, public.arena_today());
  return jsonb_build_object('xp', given);
end;
$$;

-- Tudo o que a tela da Arena precisa numa chamada.
create or replace function public.arena_my()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cfg jsonb := public.arena_cfg();
  today date := public.arena_today();
  prof public.arena_profiles%rowtype;
  cap int := coalesce((cfg->>'daily_cap')::int, 300);
  used int;
begin
  if uid is null then return null; end if;
  if not coalesce((cfg->>'enabled')::boolean, false) then
    return jsonb_build_object('enabled', false);
  end if;

  select * into prof from public.arena_profiles where user_id = uid;
  select coalesce(sum(xp), 0) into used from public.arena_xp_events
    where user_id = uid and day = today and source in ('workout', 'run');

  return jsonb_build_object(
    'enabled', true,
    'xp', coalesce(prof.xp_total, 0),
    'level', coalesce(prof.level, 1),
    'level_from', 50 * (coalesce(prof.level, 1) - 1) ^ 2,
    'level_to', 50 * coalesce(prof.level, 1) ^ 2,
    -- sequência viva só se a última atividade foi hoje ou ontem
    'streak', case when prof.last_day >= today - 1 then coalesce(prof.streak, 0) else 0 end,
    'best_streak', coalesce(prof.best_streak, 0),
    'today_xp', used,
    'daily_cap', cap,
    'missions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'title', m.title, 'description', m.description, 'period', m.period,
        'module', m.module, 'xp', m.xp,
        'ends_on', public.arena_period_end(m.period),
        'progress', pr.progress,
        'done', pr.done,
        'claimed', exists (select 1 from public.arena_mission_claims c
                           where c.user_id = uid and c.mission_id = m.id
                             and c.period_start = public.arena_period_start(m.period))
      ) order by m.period desc, m.sort, m.id)
      from public.arena_missions m
      cross join lateral (
        select public.arena_mission_progress(uid, m.goals, public.arena_period_start(m.period), public.arena_period_end(m.period)) as progress
      ) p
      cross join lateral (
        select coalesce(bool_and((e->>'have')::numeric >= (e->>'target')::numeric), false) as done,
               p.progress as progress
        from jsonb_array_elements(p.progress) e
      ) pr
      where m.active
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.arena_cfg() from public, anon, authenticated;
revoke execute on function public.arena_recalc(uuid) from public, anon, authenticated;
revoke execute on function public.arena_award(uuid, text, text, text, int, date) from public, anon, authenticated;
revoke execute on function public.arena_unaward(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.arena_metric(uuid, text, date, date) from public, anon, authenticated;
revoke execute on function public.arena_mission_progress(uuid, jsonb, date, date) from public, anon, authenticated;
revoke execute on function public.arena_claim_mission(text) from public, anon;
revoke execute on function public.arena_my() from public, anon;
grant execute on function public.arena_claim_mission(text) to authenticated;
grant execute on function public.arena_my() to authenticated;

-- ---------------------------------------------------------------------------
-- Missões iniciais (o painel ajusta depois). As híbridas empurram quem treina
-- só em um módulo a experimentar o outro.
-- ---------------------------------------------------------------------------
insert into public.arena_missions (id, title, description, period, module, goals, xp, sort) values
  ('dia_ativo',       'Mexa-se hoje',            'Faça um treino ou uma corrida hoje',          'daily',  'any', '{"active_days": 1}',            15, 10),
  ('semana_3_dias',   'Três dias em movimento',  'Treine ou corra em 3 dias da semana',          'weekly', 'any', '{"active_days": 3}',            60, 10),
  ('semana_3_treinos','Três treinos na semana',  'Conclua 3 treinos de musculação',              'weekly', 'gym', '{"workouts": 3}',              100, 20),
  ('semana_5_km',     '5 km na semana',          'Some 5 km de corrida na semana',               'weekly', 'run', '{"run_km": 5}',                100, 20),
  ('semana_hibrida',  'Semana completa',         '1 treino de musculação + 1 corrida na semana', 'weekly', 'any', '{"workouts": 1, "runs": 1}',   150, 30)
on conflict (id) do nothing;
