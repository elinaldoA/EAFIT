-- Painel admin: resultado dos alunos por personal (Pessoas → Personais →
-- Ranking por resultado). Complementa a saúde da carteira
-- (20261126010000_admin_trainer_health.sql) com o que os alunos conseguem:
--   tr_clients        alunos com vínculo ativo
--   tr_trained14      deles, treinaram nos últimos 14 dias
--   tr_train_days     dias de treino dos alunos no período (média por semana no painel)
--   tr_pr_clients     alunos que bateram recorde de carga num exercício no período
--   tr_old / tr_old_active  vinculados há 30+ dias e, deles, treinando (14 dias)
--   tr_no_plan        alunos sem plano ativo ou com plano vencido
--   tr_appt_past / tr_appt_attended  aulas confirmadas que já aconteceram no
--                     período e, delas, em dia que o aluno registrou treino
-- days_back: 7 a 365 (padrão 30). Só contagens.
create or replace function public.admin_trainer_results(days_back int default 30)
returns table (
  tr_user uuid, tr_clients bigint, tr_trained14 bigint, tr_train_days bigint, tr_days int,
  tr_pr_clients bigint, tr_old bigint, tr_old_active bigint, tr_no_plan bigint,
  tr_appt_past bigint, tr_appt_attended bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  n int := greatest(7, least(coalesce(nullif(days_back, 0), 30), 365));
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  since date := today - (n - 1);
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with cl as (
      select c.trainer_id, c.client_id, c.linked_at from public.trainer_clients c where c.status = 'active'
    ),
    td as (
      select t.user_id, t.day from public.training_days() t
      where t.user_id in (select client_id from cl) and t.day >= least(since, today - 13)
    ),
    sets as (
      select w.user_id, s.exercise_name, w.workout_date as day, max(s.carga) as carga
      from public.exercise_sets s
      join public.workouts w on w.id = s.workout_id
      where s.completed and s.carga > 0 and w.user_id in (select client_id from cl)
      group by w.user_id, s.exercise_name, w.workout_date
    ),
    pr as (
      select distinct cur.user_id
      from sets cur
      where cur.day >= since
        and cur.carga > coalesce((select max(p.carga) from sets p
                                   where p.user_id = cur.user_id and p.exercise_name = cur.exercise_name and p.day < cur.day), 'infinity'::numeric)
    ),
    appt as (
      select a.trainer_id,
             count(*) as past,
             count(*) filter (where exists (
               select 1 from td where td.user_id = a.client_id and td.day = (a.starts_at at time zone 'America/Sao_Paulo')::date)) as attended
      from public.trainer_appointments a
      where a.status = 'confirmed' and a.starts_at <= now()
        and (a.starts_at at time zone 'America/Sao_Paulo')::date >= since
      group by a.trainer_id
    )
    select t.user_id,
           (select count(*) from cl where cl.trainer_id = t.user_id),
           (select count(*) from cl where cl.trainer_id = t.user_id
              and exists (select 1 from td where td.user_id = cl.client_id and td.day > today - 14)),
           (select count(*) from cl join td on td.user_id = cl.client_id
             where cl.trainer_id = t.user_id and td.day >= since),
           n,
           (select count(*) from cl where cl.trainer_id = t.user_id and cl.client_id in (select user_id from pr)),
           (select count(*) from cl where cl.trainer_id = t.user_id and cl.linked_at <= now() - interval '30 days'),
           (select count(*) from cl where cl.trainer_id = t.user_id and cl.linked_at <= now() - interval '30 days'
              and exists (select 1 from td where td.user_id = cl.client_id and td.day > today - 14)),
           (select count(*) from cl where cl.trainer_id = t.user_id
              and not exists (select 1 from public.workout_plans wp
                               where wp.user_id = cl.client_id and wp.is_active and (wp.end_date is null or wp.end_date >= today))),
           coalesce((select appt.past from appt where appt.trainer_id = t.user_id), 0),
           coalesce((select appt.attended from appt where appt.trainer_id = t.user_id), 0)
    from public.trainers t;
end;
$$;

revoke execute on function public.admin_trainer_results(int) from public, anon;
grant execute on function public.admin_trainer_results(int) to authenticated;
