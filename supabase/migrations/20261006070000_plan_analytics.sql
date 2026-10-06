-- Análise dos planos de treino no painel admin: situação dos planos, aderência
-- por objetivo e nível, e o ritmo de treino (dia da semana e horário).
--
-- Convenções (iguais às de 20261002020000_admin_funnel_retention.sql):
--  * "treinou" = public.training_days() (uma linha por usuário/dia).
--  * Admins ficam fora (contas de teste/operação).
--  * Datas e horários no fuso America/Sao_Paulo.
--  * Aderência = treinos feitos nos últimos 30 dias / treinos planejados no
--    período (dias de força do plano ativo por semana x 30/7), limitada a 100%
--    por usuário pra quem treina além do plano não puxar a média.
--  * Em funções com RETURNS TABLE as colunas de saída viram variáveis
--    plpgsql: toda coluna de tabela é qualificada com alias.

-- ---------------------------------------------------------------------------
-- Situação dos planos (uma linha).
-- ---------------------------------------------------------------------------
create or replace function public.admin_plan_summary()
returns table (
  users_total bigint,
  users_with_plan bigint,
  users_without_plan bigint,
  expired_active bigint,
  expiring_7d bigint,
  chained_pct numeric,
  avg_cycle_weeks numeric
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with nonadmin as (
      select u.id as uid
      from auth.users u
      left join public.profiles p on p.id = u.id
      where not coalesce(p.is_admin, false)
    ),
    active as (
      select wp.user_id as uid, wp.end_date, wp.next_plan_id, wp.duration_weeks
      from public.workout_plans wp
      join nonadmin n on n.uid = wp.user_id
      where wp.is_active
    )
    select
      (select count(*) from nonadmin),
      (select count(distinct a.uid) from active a),
      (select count(*) from nonadmin n where not exists (select 1 from active a where a.uid = n.uid)),
      (select count(*) from active a where a.end_date is not null and a.end_date < today),
      (select count(*) from active a where a.end_date is not null and a.end_date between today and today + 7),
      (select round(100.0 * count(*) filter (where a.next_plan_id is not null) / nullif(count(*), 0))
         from active a where a.end_date is not null),
      (select round(avg(a.duration_weeks), 1) from active a where a.duration_weeks > 0);
end;
$$;

grant execute on function public.admin_plan_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- Aderência por objetivo (meta) e por nível.
-- ---------------------------------------------------------------------------
create or replace function public.admin_plan_breakdown()
returns table (
  dimension text,
  value text,
  users bigint,
  with_plan bigint,
  trained_30d bigint,
  never_trained bigint,
  sessions_per_week numeric,
  adherence_pct numeric,
  pain_users bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with nonadmin as (
      select u.id as uid,
             coalesce(nullif(u.raw_user_meta_data->>'meta', ''), 'não informado') as meta,
             coalesce(nullif(u.raw_user_meta_data->>'nivel', ''), 'não informado') as nivel
      from auth.users u
      left join public.profiles p on p.id = u.id
      where not coalesce(p.is_admin, false)
    ),
    sess as (
      select t.user_id as uid,
             count(*) filter (where t.day > today - 30) as s30,
             count(*) as total
      from public.training_days() t
      group by t.user_id
    ),
    planned as (
      select wp.user_id as uid, count(pd.id) as per_week
      from public.workout_plans wp
      join public.plan_days pd on pd.plan_id = wp.id
      where wp.is_active
        and btrim(pd.foco) <> '' and pd.foco !~* 'descanso'
        and exists (select 1 from public.plan_exercises pe where pe.plan_day_id = pd.id and not pe.is_post_workout)
      group by wp.user_id
    ),
    pain as (
      select distinct d.user_id as uid
      from public.exercise_discomfort d
      where d.severity in ('forte', 'lesao') and d.log_date > today - 30
    ),
    base as (
      select n.meta, n.nivel,
             coalesce(s.s30, 0) as s30,
             coalesce(s.total, 0) as total,
             pl.per_week,
             exists (select 1 from public.workout_plans wp where wp.user_id = n.uid and wp.is_active) as has_plan,
             pa.uid is not null as has_pain
      from nonadmin n
      left join sess s on s.uid = n.uid
      left join planned pl on pl.uid = n.uid
      left join pain pa on pa.uid = n.uid
    )
    select 'meta'::text, b.meta, count(*)::bigint,
           count(*) filter (where b.has_plan),
           count(*) filter (where b.s30 > 0),
           count(*) filter (where b.total = 0),
           round(avg(b.s30::numeric) filter (where b.has_plan) * 7 / 30, 1),
           round(100 * sum(least(b.s30::numeric, b.per_week * 30 / 7.0)) filter (where b.per_week is not null)
                 / nullif(sum(b.per_week * 30 / 7.0) filter (where b.per_week is not null), 0)),
           count(*) filter (where b.has_pain)
    from base b group by b.meta
    union all
    select 'nivel'::text, b.nivel, count(*)::bigint,
           count(*) filter (where b.has_plan),
           count(*) filter (where b.s30 > 0),
           count(*) filter (where b.total = 0),
           round(avg(b.s30::numeric) filter (where b.has_plan) * 7 / 30, 1),
           round(100 * sum(least(b.s30::numeric, b.per_week * 30 / 7.0)) filter (where b.per_week is not null)
                 / nullif(sum(b.per_week * 30 / 7.0) filter (where b.per_week is not null), 0)),
           count(*) filter (where b.has_pain)
    from base b group by b.nivel;
end;
$$;

grant execute on function public.admin_plan_breakdown() to authenticated;

-- ---------------------------------------------------------------------------
-- Ritmo de treino: quantos treinos por dia da semana (0=domingo) e por hora do
-- dia (0-23, pelo começo do treino ao vivo). Ajuda a escolher dias e horários
-- das notificações automáticas.
-- ---------------------------------------------------------------------------
create or replace function public.admin_training_rhythm(days_back int default 90)
returns table (kind text, bucket int, sessions bigint)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with nonadmin as (
      select u.id as uid
      from auth.users u
      left join public.profiles p on p.id = u.id
      where not coalesce(p.is_admin, false)
    )
    select 'weekday'::text, extract(dow from t.day)::int, count(*)::bigint
    from public.training_days() t
    join nonadmin n on n.uid = t.user_id
    where t.day > today - days_back
    group by 2
    union all
    select 'hour'::text, extract(hour from (w.started_at at time zone 'America/Sao_Paulo'))::int, count(*)::bigint
    from public.workouts w
    join nonadmin n on n.uid = w.user_id
    where w.started_at is not null
      and w.started_at > now() - make_interval(days => days_back)
      and (w.completed or w.finished_at is not null)
    group by 2;
end;
$$;

grant execute on function public.admin_training_rhythm(int) to authenticated;
