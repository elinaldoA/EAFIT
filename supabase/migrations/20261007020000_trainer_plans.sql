-- O personal monta o treino do aluno e o envia: vira o plano ATIVO do aluno.
--
-- workout_plans.created_by guarda quem montou o plano (null = o próprio
-- aluno / gerado pelo app). O app usa isso pra mostrar "Plano do seu personal"
-- e pra NÃO trocar esse plano sozinho quando o ciclo vence (a evolução
-- automática de ciclo continua só para planos do próprio aluno).
--
-- trainer_assign_plan é security definer porque o personal não tem policy de
-- escrita nas tabelas do aluno: a função confere o vínculo ativo
-- (is_trainer_of), valida o conteúdo e faz tudo numa transação. O plano
-- anterior do aluno continua salvo, só fica inativo (ele pode reativá-lo em
-- "Editar treino").

alter table public.workout_plans
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create or replace function public.trainer_assign_plan(
  p_client uuid,
  p_name text,
  p_days jsonb,
  p_duration_weeks int default null,
  p_start_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_day record;
  v_day_id uuid;
  v_start date := coalesce(p_start_date, (now() at time zone 'America/Sao_Paulo')::date);
begin
  if not public.is_trainer_of(p_client) then raise exception 'not_authorized'; end if;

  if p_name is null or length(btrim(p_name)) < 2 or length(btrim(p_name)) > 60 then raise exception 'invalid_name'; end if;
  if p_days is null or jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) not between 1 and 7 then
    raise exception 'invalid_days';
  end if;
  if p_duration_weeks is not null and p_duration_weeks not between 1 and 52 then raise exception 'invalid_duration'; end if;

  -- cada dia precisa de ao menos 1 exercício com nome, no máximo 20
  if exists (
    select 1 from jsonb_array_elements(p_days) d
    where coalesce(jsonb_array_length(d->'exercicios'), 0) not between 1 and 20
       or exists (select 1 from jsonb_array_elements(d->'exercicios') e where length(btrim(coalesce(e->>'nome', ''))) = 0)
  ) then
    raise exception 'invalid_exercises';
  end if;

  insert into public.workout_plans (user_id, name, is_active, created_by)
  values (p_client, btrim(p_name), false, auth.uid())
  returning id into v_plan_id;

  for v_day in
    select value as day, (ordinality - 1)::int as idx
    from jsonb_array_elements(p_days) with ordinality
  loop
    insert into public.plan_days (plan_id, dia, foco, order_index)
    values (v_plan_id, v_day.day->>'dia', coalesce(v_day.day->>'foco', ''), v_day.idx)
    returning id into v_day_id;

    insert into public.plan_exercises (plan_day_id, nome, series, reps, descanso, tecnica, is_post_workout, order_index)
    select v_day_id, btrim(e.value->>'nome'), coalesce(e.value->>'series', ''), coalesce(e.value->>'reps', ''),
           coalesce(e.value->>'descanso', ''), coalesce(e.value->>'tecnica', ''), false, (e.ordinality - 1)::int
    from jsonb_array_elements(v_day.day->'exercicios') with ordinality e;
  end loop;

  update public.workout_plans set is_active = false where user_id = p_client and id <> v_plan_id;

  if coalesce(p_duration_weeks, 0) > 0 then
    update public.workout_plans
      set is_active = true, start_date = v_start, end_date = v_start + p_duration_weeks * 7, duration_weeks = p_duration_weeks
      where id = v_plan_id;
  else
    update public.workout_plans
      set is_active = true, start_date = null, end_date = null, duration_weeks = null
      where id = v_plan_id;
  end if;

  return v_plan_id;
end;
$$;

-- Plano ativo do aluno no formato do editor (pra o personal editar a partir
-- dele em vez de começar do zero). Só com vínculo ativo.
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
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'dia', d.dia, 'foco', d.foco,
        'exercicios', coalesce((
          select jsonb_agg(jsonb_build_object('nome', e.nome, 'series', e.series, 'reps', e.reps, 'descanso', e.descanso, 'tecnica', e.tecnica)
                           order by e.order_index)
          from public.plan_exercises e where e.plan_day_id = d.id and not e.is_post_workout
        ), '[]'::jsonb)
      ) order by d.order_index)
      from public.plan_days d where d.plan_id = v_plan.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.trainer_assign_plan(uuid, text, jsonb, int, date) from public, anon;
revoke execute on function public.trainer_client_plan(uuid) from public, anon;
grant execute on function public.trainer_assign_plan(uuid, text, jsonb, int, date) to authenticated;
grant execute on function public.trainer_client_plan(uuid) to authenticated;
