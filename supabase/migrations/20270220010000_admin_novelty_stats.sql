-- Painel admin: adoção das funções novas (PAR-Q, RIR e tipo de série, técnicas de intensidade,
-- periodização semanal e corrida). Só números agregados: nenhuma resposta, lesão ou
-- medicamento individual sai daqui (dado de saúde, LGPD art. 11). Admins ficam fora da conta
-- (são contas de teste/operação). days_back = janela de uso (séries e corridas); PAR-Q,
-- planos e totais são do estado atual. Idempotente (create or replace).

create or replace function public.admin_novelty_stats(days_back int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  d int := greatest(1, least(coalesce(days_back, 30), 365));
  since date := (now() at time zone 'America/Sao_Paulo')::date - d;
  out jsonb;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  with people as (
    select u.id, u.raw_user_meta_data as meta
    from auth.users u
    left join public.profiles p on p.id = u.id
    where not coalesce(p.is_admin, false)
  ),
  sets as (
    select w.user_id, s.rir, s.tipo
    from public.exercise_sets s
    join public.workouts w on w.id = s.workout_id
    join people pe on pe.id = w.user_id
    where s.completed and w.workout_date >= since
  ),
  plans as (
    select wp.id, wp.user_id, wp.progressao_passo, wp.deload_a_cada
    from public.workout_plans wp
    join people pe on pe.id = wp.user_id
    where wp.is_active
  ),
  tech as (
    select pl.user_id, pex.intensidade
    from plans pl
    join public.plan_days pd on pd.plan_id = pl.id
    join public.plan_exercises pex on pex.plan_day_id = pd.id
    where pex.intensidade is not null
  ),
  rr as (
    select r.user_id, r.distance_m, r.gps
    from public.runs r
    join people pe on pe.id = r.user_id
    where r.run_date >= since
  )
  select jsonb_build_object(
    'days', d,
    'users', (select count(*) from people),
    'parq', jsonb_build_object(
      'answered', (select count(*) from people where coalesce(meta->>'parqAt', '') <> ''),
      'with_alert', (select count(*) from people where coalesce(meta->>'parqAt', '') <> '' and meta->>'parqAlert' = 'true'),
      'skipped', (select count(*) from people where coalesce(meta->>'parqAt', '') = '' and coalesce(meta->>'parqSkippedAt', '') <> ''),
      'with_notes', (select count(*) from people where coalesce(meta->>'lesoes', '') <> '' or coalesce(meta->>'restricoes', '') <> '' or coalesce(meta->>'medicamentos', '') <> '')
    ),
    'sets', jsonb_build_object(
      'total', (select count(*) from sets),
      'users', (select count(distinct user_id) from sets),
      'with_rir', (select count(*) from sets where rir is not null),
      'rir_users', (select count(distinct user_id) from sets where rir is not null),
      'drop_set', (select count(*) from sets where tipo = 'drop_set'),
      'rest_pause', (select count(*) from sets where tipo = 'rest_pause'),
      'cluster', (select count(*) from sets where tipo = 'cluster'),
      'falha', (select count(*) from sets where tipo = 'falha'),
      'typed_users', (select count(distinct user_id) from sets where tipo is not null)
    ),
    'plans', jsonb_build_object(
      'active', (select count(*) from plans),
      'with_technique', (select count(distinct user_id) from tech),
      'technique_exercises', (select count(*) from tech),
      'with_progression', (select count(*) from plans where progressao_passo is not null),
      'with_deload', (select count(*) from plans where deload_a_cada is not null)
    ),
    'runs', jsonb_build_object(
      'runners', (select count(distinct user_id) from rr),
      'runs', (select count(*) from rr),
      'km', (select round(coalesce(sum(distance_m), 0) / 1000.0, 1) from rr),
      'gps', (select count(*) from rr where gps)
    )
  ) into out;

  return out;
end;
$$;

revoke execute on function public.admin_novelty_stats(int) from public, anon;
grant execute on function public.admin_novelty_stats(int) to authenticated, service_role;
