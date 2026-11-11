-- Periodizacao simples por semana, configurada por plano:
--   progressao_passo: kg a mais por semana sobre a ultima carga (nulo = sem meta semanal).
--   deload_a_cada:    a cada N semanas do ciclo, a semana e leve (series reduzidas).
-- A semana atual vem de workout_plans.start_date. O aluno edita o proprio plano
-- (politica ja existente); o personal usa trainer_set_plan_progression.

alter table public.workout_plans add column if not exists progressao_passo numeric;
alter table public.workout_plans drop constraint if exists workout_plans_progressao_passo_check;
alter table public.workout_plans
  add constraint workout_plans_progressao_passo_check check (progressao_passo is null or (progressao_passo > 0 and progressao_passo <= 20));

alter table public.workout_plans add column if not exists deload_a_cada smallint;
alter table public.workout_plans drop constraint if exists workout_plans_deload_a_cada_check;
alter table public.workout_plans
  add constraint workout_plans_deload_a_cada_check check (deload_a_cada is null or deload_a_cada between 2 and 12);

create or replace function public.trainer_set_plan_progression(p_client uuid, p_step numeric, p_deload int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_trainer_of(p_client) then raise exception 'not_authorized'; end if;
  if p_step is not null and (p_step <= 0 or p_step > 20) then raise exception 'invalid_step'; end if;
  if p_deload is not null and p_deload not between 2 and 12 then raise exception 'invalid_deload'; end if;

  update public.workout_plans
     set progressao_passo = p_step, deload_a_cada = p_deload
   where user_id = p_client and is_active;
end;
$$;

grant execute on function public.trainer_set_plan_progression(uuid, numeric, int) to authenticated;
revoke execute on function public.trainer_set_plan_progression(uuid, numeric, int) from public, anon;

create or replace function public.trainer_client_plan(p_client uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan public.workout_plans%rowtype;
begin
  if not public.is_trainer_of(p_client) then raise exception 'not_authorized'; end if;

  select * into v_plan from public.workout_plans p where p.user_id = p_client and p.is_active limit 1;
  if not found then return null; end if;

  return jsonb_build_object(
    'name', v_plan.name,
    'created_by_trainer', v_plan.created_by is not null,
    'duration_weeks', v_plan.duration_weeks,
    'progressao_passo', v_plan.progressao_passo,
    'deload_a_cada', v_plan.deload_a_cada,
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dia', d.dia, 'foco', d.foco,
        'exercicios', coalesce((
          select jsonb_agg(jsonb_build_object('nome', e.nome, 'series', e.series, 'reps', e.reps, 'descanso', e.descanso, 'tecnica', e.tecnica,
                                              'grupo', e.grupo, 'aquecimento', e.aquecimento, 'intensidade', e.intensidade)
                           order by e.order_index)
          from public.plan_exercises e where e.plan_day_id = d.id and not e.is_post_workout
        ), '[]'::jsonb)
      ) order by d.order_index)
      from public.plan_days d where d.plan_id = v_plan.id
    ), '[]'::jsonb)
  );
end;
$$;
