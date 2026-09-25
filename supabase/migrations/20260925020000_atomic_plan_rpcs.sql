-- Criação e ativação de plano de treino numa transação só.
--
-- Antes, app-react/src/lib/workoutPlans.js (insertDaysAndExercises +
-- setActivePlan) e supabase/functions/admin-generate-plan faziam ~15
-- requisições separadas pra montar um plano (1 plano + 7 dias + 7 lotes de
-- exercícios) e mais 2 pra ativá-lo. Uma falha no meio (rede caiu, aba
-- fechada) deixava um plano pela metade no banco — ou, na ativação, o
-- usuário sem NENHUM plano ativo (o "desativa todos" já tinha rodado e o
-- "ativa este" não).
--
-- As duas funções são SECURITY INVOKER: chamadas pelo app, as policies RLS de
-- workout_plans/plan_days/plan_exercises continuam valendo (só dá pra criar e
-- ativar plano do próprio usuário); chamadas com service_role (Edge Function
-- de admin) passam direto, como já passavam os inserts avulsos.
--
-- p_start_date vem do cliente (data de hoje no fuso de Brasília, ver
-- todayDate() em app-react/src/data/treinoData.js) em vez de current_date,
-- que no banco é UTC e viraria o dia seguinte a partir das 21:00.

create or replace function public.activate_workout_plan(
  p_plan_id uuid,
  p_start_date date default null,
  p_duration_weeks int default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id from public.workout_plans where id = p_plan_id;
  if v_user_id is null then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;

  update public.workout_plans set is_active = false where user_id = v_user_id and id <> p_plan_id;

  -- duração nula/zero = plano sem prazo (limpa qualquer prazo anterior), igual
  -- ao comportamento de setActivePlan(userId, planId, null).
  if coalesce(p_duration_weeks, 0) > 0 then
    update public.workout_plans
      set is_active = true,
          start_date = coalesce(p_start_date, current_date),
          end_date = coalesce(p_start_date, current_date) + p_duration_weeks * 7,
          duration_weeks = p_duration_weeks
      where id = p_plan_id;
  else
    update public.workout_plans
      set is_active = true, start_date = null, end_date = null, duration_weeks = null
      where id = p_plan_id;
  end if;
end;
$$;

grant execute on function public.activate_workout_plan(uuid, date, int) to authenticated;

-- p_days: o mesmo formato de dia usado no app —
--   [{ "dia": "Segunda", "foco": "...", "exercicios": [{nome, series, reps, descanso, tecnica}], "pos": [...] }]
-- p_activate = true ativa o plano recém-criado (via activate_workout_plan)
-- dentro da mesma transação.
create or replace function public.create_workout_plan(
  p_user_id uuid,
  p_name text,
  p_days jsonb,
  p_activate boolean default false,
  p_start_date date default null,
  p_duration_weeks int default null
)
returns public.workout_plans
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_plan public.workout_plans;
  v_day record;
  v_day_id uuid;
begin
  insert into public.workout_plans (user_id, name, is_active)
    values (p_user_id, p_name, false)
    returning * into v_plan;

  for v_day in
    select value as day, (ordinality - 1)::int as idx
    from jsonb_array_elements(coalesce(p_days, '[]'::jsonb)) with ordinality
  loop
    insert into public.plan_days (plan_id, dia, foco, order_index)
      values (v_plan.id, v_day.day->>'dia', coalesce(v_day.day->>'foco', ''), v_day.idx)
      returning id into v_day_id;

    insert into public.plan_exercises (plan_day_id, nome, series, reps, descanso, tecnica, is_post_workout, order_index)
    select v_day_id, e.value->>'nome', coalesce(e.value->>'series', ''), coalesce(e.value->>'reps', ''),
           coalesce(e.value->>'descanso', ''), coalesce(e.value->>'tecnica', ''), false, (e.ordinality - 1)::int
      from jsonb_array_elements(coalesce(v_day.day->'exercicios', '[]'::jsonb)) with ordinality e
    union all
    select v_day_id, e.value->>'nome', coalesce(e.value->>'series', ''), coalesce(e.value->>'reps', ''),
           coalesce(e.value->>'descanso', ''), coalesce(e.value->>'tecnica', ''), true, (e.ordinality - 1)::int
      from jsonb_array_elements(coalesce(v_day.day->'pos', '[]'::jsonb)) with ordinality e;
  end loop;

  if p_activate then
    perform public.activate_workout_plan(v_plan.id, p_start_date, p_duration_weeks);
    select * into v_plan from public.workout_plans where id = v_plan.id;
  end if;

  return v_plan;
end;
$$;

grant execute on function public.create_workout_plan(uuid, text, jsonb, boolean, date, int) to authenticated;
