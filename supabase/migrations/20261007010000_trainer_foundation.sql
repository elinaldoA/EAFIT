-- Ambiente do Personal Trainer — fundação: quem é personal, vínculo com alunos
-- e leitura do acompanhamento.
--
-- Segurança (o ponto central):
--   • "Ser personal" NÃO é coluna de profiles: as policies de profiles deixam o
--     próprio usuário editar a linha dele, então um flag ali seria
--     autoatribuível. Fica na tabela `trainers`, sem policy de escrita; só o
--     admin cria/remove via admin_set_trainer().
--   • O personal NÃO ganha policy de leitura nas tabelas dos alunos. Ele só lê
--     o que as funções abaixo devolvem (security definer), e cada uma confere
--     antes que existe vínculo ATIVO entre o chamador e o aluno.
--   • O vínculo nasce do aluno (digita o código do personal e confirma no app)
--     e o aluno pode encerrá-lo a qualquer momento; o personal também.
--   • Um aluno tem no máximo um personal ativo.
-- As funções são `language sql/plpgsql` com colunas de saída prefixadas (tc_*,
-- cl_*) pra não colidir com colunas das tabelas.

create table if not exists public.trainers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

alter table public.trainers enable row level security;

drop policy if exists "own trainer row" on public.trainers;
create policy "own trainer row" on public.trainers
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "admin read trainers" on public.trainers;
create policy "admin read trainers" on public.trainers
  for select to authenticated using (public.is_admin());

create table if not exists public.trainer_clients (
  trainer_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked')),
  linked_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (trainer_id, client_id),
  check (trainer_id <> client_id)
);

-- um aluno só pode ter um personal ativo
create unique index if not exists trainer_clients_one_active
  on public.trainer_clients (client_id) where status = 'active';
create index if not exists trainer_clients_trainer_idx on public.trainer_clients (trainer_id, status);

alter table public.trainer_clients enable row level security;

drop policy if exists "client sees own link" on public.trainer_clients;
create policy "client sees own link" on public.trainer_clients
  for select to authenticated using (client_id = (select auth.uid()));

drop policy if exists "trainer sees own links" on public.trainer_clients;
create policy "trainer sees own links" on public.trainer_clients
  for select to authenticated using (trainer_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_trainer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.trainers t where t.user_id = auth.uid());
$$;

-- o chamador é personal E tem vínculo ativo com o aluno
create or replace function public.is_trainer_of(p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trainer_clients tc
    join public.trainers t on t.user_id = tc.trainer_id
    where tc.trainer_id = auth.uid() and tc.client_id = p_client and tc.status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- Admin: promove/remove personal. Ao remover, os vínculos dele são encerrados.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_trainer(p_user uuid, p_on boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  if p_on then
    select t.code into v_code from public.trainers t where t.user_id = p_user;
    if v_code is null then
      loop
        v_code := 'P' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
        exit when not exists (select 1 from public.trainers t where t.code = v_code);
      end loop;
      insert into public.trainers (user_id, code) values (p_user, v_code);
    end if;
    return v_code;
  end if;

  update public.trainer_clients tc set status = 'revoked', revoked_at = now()
  where tc.trainer_id = p_user and tc.status = 'active';
  delete from public.trainers t where t.user_id = p_user;
  return null;
end;
$$;

-- Admin: lista dos personais com número de alunos ativos.
create or replace function public.admin_list_trainers()
returns table (tc_user uuid, tc_email text, tc_name text, tc_code text, tc_clients bigint, tc_since timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select t.user_id, u.email::text,
           coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), u.email::text),
           t.code,
           (select count(*) from public.trainer_clients c where c.trainer_id = t.user_id and c.status = 'active'),
           t.created_at
    from public.trainers t
    join auth.users u on u.id = t.user_id
    order by t.created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Aluno: vincular, ver e encerrar o vínculo
-- ---------------------------------------------------------------------------
create or replace function public.link_trainer(p_code text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  v_trainer uuid;
  v_name text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select t.user_id into v_trainer from public.trainers t where t.code = upper(btrim(p_code));
  if v_trainer is null then raise exception 'invalid_code'; end if;
  if v_trainer = uid then raise exception 'self_link'; end if;

  if exists (select 1 from public.trainer_clients c where c.client_id = uid and c.status = 'active' and c.trainer_id <> v_trainer) then
    raise exception 'already_linked';
  end if;

  insert into public.trainer_clients (trainer_id, client_id, status, linked_at, revoked_at)
  values (v_trainer, uid, 'active', now(), null)
  on conflict (trainer_id, client_id)
  do update set status = 'active', linked_at = now(), revoked_at = null;

  select coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), 'seu personal')
    into v_name from auth.users u where u.id = v_trainer;
  return v_name;
end;
$$;

create or replace function public.unlink_trainer()
returns void
language sql
security definer
set search_path = public
as $$
  update public.trainer_clients c set status = 'revoked', revoked_at = now()
  where c.client_id = auth.uid() and c.status = 'active';
$$;

create or replace function public.my_trainer()
returns table (tc_name text, tc_since timestamptz)
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), 'Seu personal'),
         c.linked_at
  from public.trainer_clients c
  join auth.users u on u.id = c.trainer_id
  where c.client_id = auth.uid() and c.status = 'active';
$$;

-- ---------------------------------------------------------------------------
-- Personal: código, encerrar vínculo, lista de alunos
-- ---------------------------------------------------------------------------
create or replace function public.trainer_my_code()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select t.code from public.trainers t where t.user_id = auth.uid();
$$;

create or replace function public.trainer_remove_client(p_client uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_trainer() then raise exception 'not_authorized'; end if;
  update public.trainer_clients c set status = 'revoked', revoked_at = now()
  where c.trainer_id = auth.uid() and c.client_id = p_client and c.status = 'active';
end;
$$;

create or replace function public.trainer_clients_overview()
returns table (
  cl_id uuid,
  cl_name text,
  cl_email text,
  cl_since timestamptz,
  cl_last_day date,
  cl_days_7 int,
  cl_days_30 int,
  cl_paused boolean,
  cl_goal text,
  cl_level text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_trainer() then raise exception 'not_authorized'; end if;

  return query
    with mine as (
      select c.client_id, c.linked_at
      from public.trainer_clients c
      where c.trainer_id = auth.uid() and c.status = 'active'
    ),
    td as (
      select d.user_id, d.day
      from public.training_days() d
      where d.user_id in (select m.client_id from mine m) and d.day >= today - 30
    )
    select m.client_id,
           coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), split_part(u.email::text, '@', 1)),
           u.email::text,
           m.linked_at,
           (select max(t.day) from public.training_days() t where t.user_id = m.client_id),
           (select count(*) from td where td.user_id = m.client_id and td.day >= today - 6)::int,
           (select count(*) from td where td.user_id = m.client_id)::int,
           case
             when (u.raw_user_meta_data->>'pausedUntil') ~ '^\d{4}-\d{2}-\d{2}$'
             then (u.raw_user_meta_data->>'pausedUntil') >= today::text
             else false
           end,
           u.raw_user_meta_data->>'meta',
           u.raw_user_meta_data->>'nivel'
    from mine m
    join auth.users u on u.id = m.client_id
    order by 5 desc nulls last;
end;
$$;

-- ---------------------------------------------------------------------------
-- Personal: acompanhamento completo de UM aluno (jsonb pra evoluir sem mudar
-- a assinatura). Só com vínculo ativo.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
revoke execute on function public.is_trainer() from public, anon;
revoke execute on function public.is_trainer_of(uuid) from public, anon;
revoke execute on function public.admin_set_trainer(uuid, boolean) from public, anon;
revoke execute on function public.admin_list_trainers() from public, anon;
revoke execute on function public.link_trainer(text) from public, anon;
revoke execute on function public.unlink_trainer() from public, anon;
revoke execute on function public.my_trainer() from public, anon;
revoke execute on function public.trainer_my_code() from public, anon;
revoke execute on function public.trainer_remove_client(uuid) from public, anon;
revoke execute on function public.trainer_clients_overview() from public, anon;
revoke execute on function public.trainer_client_detail(uuid) from public, anon;

grant execute on function public.is_trainer() to authenticated;
grant execute on function public.is_trainer_of(uuid) to authenticated;
grant execute on function public.admin_set_trainer(uuid, boolean) to authenticated;
grant execute on function public.admin_list_trainers() to authenticated;
grant execute on function public.link_trainer(text) to authenticated;
grant execute on function public.unlink_trainer() to authenticated;
grant execute on function public.my_trainer() to authenticated;
grant execute on function public.trainer_my_code() to authenticated;
grant execute on function public.trainer_remove_client(uuid) to authenticated;
grant execute on function public.trainer_clients_overview() to authenticated;
grant execute on function public.trainer_client_detail(uuid) to authenticated;
