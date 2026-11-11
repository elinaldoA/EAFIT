-- A ficha do aluno vista pelo personal passa a trazer o resultado do PAR-Q
-- (data, respostas e alerta) e os medicamentos informados pelo proprio aluno.
-- Continua exigindo vinculo ativo (is_trainer_of) dentro da funcao.

create or replace function public.trainer_client_detail(p_client uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  result jsonb;
begin
  if not public.is_trainer_of(p_client) then raise exception 'not_authorized'; end if;

  select jsonb_build_object(
    'profile', (
      select jsonb_build_object(
        'name', coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), split_part(u.email::text, '@', 1)),
        'email', u.email::text,
        'peso', u.raw_user_meta_data->>'peso',
        'pesoAlvo', u.raw_user_meta_data->>'pesoAlvo',
        'altura', u.raw_user_meta_data->>'altura',
        'idade', u.raw_user_meta_data->>'idade',
        'sexo', u.raw_user_meta_data->>'sexo',
        'lesoes', u.raw_user_meta_data->>'lesoes',
        'restricoes', u.raw_user_meta_data->>'restricoes',
        'emergenciaNome', u.raw_user_meta_data->>'emergenciaNome',
        'emergenciaTel', u.raw_user_meta_data->>'emergenciaTel',
        'medicamentos', u.raw_user_meta_data->>'medicamentos',
        'parqAt', u.raw_user_meta_data->>'parqAt',
        'parqAnswers', u.raw_user_meta_data->>'parqAnswers',
        'parqAlert', u.raw_user_meta_data->>'parqAlert',
        'meta', u.raw_user_meta_data->>'meta',
        'nivel', u.raw_user_meta_data->>'nivel',
        'weeklyGoal', u.raw_user_meta_data->>'weeklyGoal',
        'pausedUntil', u.raw_user_meta_data->>'pausedUntil',
        'trainingHour', u.raw_user_meta_data->>'trainingHour'
      )
      from auth.users u where u.id = p_client
    ),
    'training_days', coalesce((
      select jsonb_agg(d.day order by d.day)
      from public.training_days() d where d.user_id = p_client and d.day >= today - 120
    ), '[]'::jsonb),
    'weights', coalesce((
      select jsonb_agg(jsonb_build_object('d', w.log_date, 'v', w.weight) order by w.log_date)
      from public.weight_logs w where w.user_id = p_client and w.log_date >= today - 180
    ), '[]'::jsonb),
    'measurements', coalesce((
      select jsonb_agg(jsonb_build_object('d', m.measured_on, 'cintura', m.cintura, 'quadril', m.quadril,
                                          'peito', m.peito, 'braco', m.braco, 'coxa', m.coxa) order by m.measured_on)
      from public.body_measurements m where m.user_id = p_client and m.measured_on >= today - 365
    ), '[]'::jsonb),
    'checkins', coalesce((
      select jsonb_agg(jsonb_build_object('d', k.checkin_date, 'energy', k.energy, 'sleep', k.sleep, 'mood', k.mood) order by k.checkin_date)
      from public.daily_checkins k where k.user_id = p_client and k.checkin_date >= today - 30
    ), '[]'::jsonb),
    'discomfort', coalesce((
      select jsonb_agg(jsonb_build_object('d', x.log_date, 'exercise', x.exercise_name, 'severity', x.severity, 'note', x.note)
                       order by x.log_date desc)
      from public.exercise_discomfort x where x.user_id = p_client and x.log_date >= today - 30
    ), '[]'::jsonb),
    'loads', coalesce((
      select jsonb_agg(l order by l->>'exercise')
      from (
        select jsonb_build_object('exercise', s.exercise_name, 'max', max(s.kg), 'sessions', count(distinct s.workout_date)) as l
        from (
          select es.exercise_name, w.workout_date, es.carga as kg
          from public.exercise_sets es
          join public.workouts w on w.id = es.workout_id
          where w.user_id = p_client and es.completed and es.carga > 0 and w.workout_date >= today - 90
        ) s
        where s.kg is not null
        group by s.exercise_name
        order by count(distinct s.workout_date) desc
        limit 12
      ) q
    ), '[]'::jsonb),
    'plan', (
      select jsonb_build_object('id', p.id, 'name', p.name, 'days', (select count(*) from public.plan_days pd where pd.plan_id = p.id))
      from public.workout_plans p where p.user_id = p_client and p.is_active
      limit 1
    )
  ) into result;

  return result;
end;
$$;
