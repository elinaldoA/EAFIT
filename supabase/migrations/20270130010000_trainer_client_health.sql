-- Saude e contato de emergencia do aluno, editaveis pelo personal na ficha:
--   lesoes e restricoes (texto livre, ate 200 caracteres cada),
--   emergenciaNome (ate 80) e emergenciaTel (so digitos e + ( ) . - espaco, ate 20).
-- Como o sexo biologico, vivem em auth.users.user_metadata (dado do proprio
-- aluno, que o personal vinculado ve e corrige). Vazio limpa. Quebras de linha
-- viram espaco. trainer_client_detail passa a devolve-los em 'profile'.

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

create or replace function public.trainer_update_client(p_client uuid, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_meta jsonb := '{}'::jsonb;
  v_val text;
  v_email text;
  v_old text;
  k text;
begin
  if not public.is_trainer_of(p_client) then raise exception 'not_authorized'; end if;

  foreach k in array array['nome','sexo','peso','pesoAlvo','altura','idade','meta','nivel','weeklyGoal','lesoes','restricoes','emergenciaNome','emergenciaTel'] loop
    if p_data ? k and jsonb_typeof(p_data->k) <> 'null' then
      v_val := left(regexp_replace(btrim(p_data->>k), '\s+', ' ', 'g'),
                    case when k in ('lesoes', 'restricoes') then 200 else 80 end);
      if k in ('peso','pesoAlvo','altura','idade','weeklyGoal') and v_val <> '' and v_val !~ '^[0-9]+([.,][0-9]+)?$' then
        raise exception 'invalid_data';
      end if;
      if k = 'meta' and v_val not in ('', 'massa','forca','emagrecer','definicao','saude','resistencia') then
        raise exception 'invalid_data';
      end if;
      if k = 'nivel' and v_val not in ('', 'iniciante','intermediario','avancado') then
        raise exception 'invalid_data';
      end if;
      if k = 'sexo' and v_val not in ('', 'M', 'F') then
        raise exception 'invalid_data';
      end if;
      if k = 'emergenciaTel' and v_val !~ '^[0-9+() .-]{0,20}$' then
        raise exception 'invalid_data';
      end if;
      if k = 'nome' and v_val = '' then raise exception 'invalid_data'; end if;
      if k not in ('nome', 'sexo', 'lesoes', 'restricoes', 'emergenciaNome', 'emergenciaTel') then v_val := replace(v_val, ',', '.'); end if;
      v_meta := v_meta || jsonb_build_object(k, v_val);
    end if;
  end loop;

  if p_data ? 'email' and jsonb_typeof(p_data->'email') <> 'null' then
    v_email := lower(btrim(p_data->>'email'));
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email'; end if;
    select u.email::text into v_old from auth.users u where u.id = p_client;
    if v_email is distinct from lower(v_old) then
      if exists (select 1 from auth.users u where lower(u.email::text) = v_email and u.id <> p_client) then
        raise exception 'email_in_use';
      end if;
      update auth.users
        set email = v_email, email_change = '', email_change_token_new = '', updated_at = now()
        where id = p_client;
      update auth.identities
        set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(v_email)), updated_at = now()
        where user_id = p_client and provider = 'email';
      update public.profiles set email = v_email, updated_at = now() where id = p_client;
    end if;
  end if;

  if v_meta <> '{}'::jsonb then
    update auth.users
      set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || v_meta, updated_at = now()
      where id = p_client;
  end if;
end;
$$;

revoke execute on function public.trainer_client_detail(uuid) from public, anon;
grant execute on function public.trainer_client_detail(uuid) to authenticated;
revoke execute on function public.trainer_update_client(uuid, jsonb) from public, anon;
grant execute on function public.trainer_update_client(uuid, jsonb) to authenticated;
