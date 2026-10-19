-- Bi-set/tri-set/circuito, séries de aquecimento e frequência cardíaca do treino.
--
-- plan_exercises.grupo: letra do grupo (A, B, ...). Exercícios SEGUIDOS com a
--   mesma letra formam um bi-set (2), tri-set (3) ou circuito (4+): no app, o
--   descanso só entra depois do último exercício da volta (ver
--   app-react/src/lib/supersets.js). Nulo = exercício avulso.
-- plan_exercises.aquecimento: quantas séries de aquecimento (0 a 3) antes das
--   séries de trabalho. Nulo = automático (o app sugere 2 no primeiro exercício
--   do dia, ver app-react/src/lib/warmup.js). As séries de aquecimento ficam só
--   no aparelho: não entram em exercise_sets, no volume nem nos recordes.
-- workouts.hr_avg / hr_max / hr_zones: resumo da cinta cardíaca (Web Bluetooth)
--   no treino; hr_zones = segundos em cada uma das 5 zonas, [z1..z5].
--
-- create_workout_plan, trainer_assign_plan e trainer_client_plan passam a
-- copiar os dois campos novos. Os corpos são os de produção (conferidos com
-- pg_get_functiondef em 2026-10-19), só com as colunas novas. Os modelos do
-- personal (trainer_templates.days) guardam o jsonb inteiro e já carregam os
-- campos sem mudança.

alter table public.plan_exercises
  add column if not exists grupo text,
  add column if not exists aquecimento smallint;

alter table public.plan_exercises drop constraint if exists plan_exercises_grupo_check;
alter table public.plan_exercises
  add constraint plan_exercises_grupo_check check (grupo is null or grupo ~ '^[A-Z]$');

alter table public.plan_exercises drop constraint if exists plan_exercises_aquecimento_check;
alter table public.plan_exercises
  add constraint plan_exercises_aquecimento_check check (aquecimento is null or aquecimento between 0 and 3);

alter table public.workouts
  add column if not exists hr_avg smallint,
  add column if not exists hr_max smallint,
  add column if not exists hr_zones jsonb;

alter table public.workouts drop constraint if exists workouts_hr_check;
alter table public.workouts
  add constraint workouts_hr_check check (
    (hr_avg is null or hr_avg between 30 and 250)
    and (hr_max is null or hr_max between 30 and 250)
    and (hr_zones is null or (jsonb_typeof(hr_zones) = 'array' and jsonb_array_length(hr_zones) = 5))
  );

-- Normaliza os campos vindos do jsonb do app: letra maiúscula única e 0..3;
-- qualquer outra coisa vira nulo em vez de derrubar a criação do plano.
create or replace function public.plan_ex_grupo(p jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select case when upper(btrim(coalesce(p->>'grupo', ''))) ~ '^[A-Z]$' then upper(btrim(p->>'grupo')) end;
$$;

create or replace function public.plan_ex_aquecimento(p jsonb)
returns smallint
language sql
immutable
set search_path = public
as $$
  select case when btrim(coalesce(p->>'aquecimento', '')) ~ '^[0-3]$' then btrim(p->>'aquecimento')::smallint end;
$$;

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

    insert into public.plan_exercises (plan_day_id, nome, series, reps, descanso, tecnica, is_post_workout, order_index, grupo, aquecimento)
    select v_day_id, e.value->>'nome', coalesce(e.value->>'series', ''), coalesce(e.value->>'reps', ''),
           coalesce(e.value->>'descanso', ''), coalesce(e.value->>'tecnica', ''), false, (e.ordinality - 1)::int,
           public.plan_ex_grupo(e.value), public.plan_ex_aquecimento(e.value)
      from jsonb_array_elements(coalesce(v_day.day->'exercicios', '[]'::jsonb)) with ordinality e
    union all
    select v_day_id, e.value->>'nome', coalesce(e.value->>'series', ''), coalesce(e.value->>'reps', ''),
           coalesce(e.value->>'descanso', ''), coalesce(e.value->>'tecnica', ''), true, (e.ordinality - 1)::int,
           null, null
      from jsonb_array_elements(coalesce(v_day.day->'pos', '[]'::jsonb)) with ordinality e;
  end loop;

  if p_activate then
    perform public.activate_workout_plan(v_plan.id, p_start_date, p_duration_weeks);
    select * into v_plan from public.workout_plans where id = v_plan.id;
  end if;

  return v_plan;
end;
$$;

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

    insert into public.plan_exercises (plan_day_id, nome, series, reps, descanso, tecnica, is_post_workout, order_index, grupo, aquecimento)
    select v_day_id, btrim(e.value->>'nome'), coalesce(e.value->>'series', ''), coalesce(e.value->>'reps', ''),
           coalesce(e.value->>'descanso', ''), coalesce(e.value->>'tecnica', ''), false, (e.ordinality - 1)::int,
           public.plan_ex_grupo(e.value), public.plan_ex_aquecimento(e.value)
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
          select jsonb_agg(jsonb_build_object('nome', e.nome, 'series', e.series, 'reps', e.reps, 'descanso', e.descanso, 'tecnica', e.tecnica,
                                              'grupo', e.grupo, 'aquecimento', e.aquecimento)
                           order by e.order_index)
          from public.plan_exercises e where e.plan_day_id = d.id and not e.is_post_workout
        ), '[]'::jsonb)
      ) order by d.order_index)
      from public.plan_days d where d.plan_id = v_plan.id
    ), '[]'::jsonb)
  );
end;
$$;
