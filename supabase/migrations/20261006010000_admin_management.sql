-- Painel admin gerencial: KPIs com comparação de período, atividade diária,
-- usuários em risco de abandono, planos vencendo, exercícios mais feitos,
-- perfil do público, lista de usuários com engajamento/ordenação/filtros e
-- notas internas por usuário.
--
-- Convenções (iguais às de 20261002020000_admin_funnel_retention.sql):
--  * "treinou" = public.training_days() (uma linha por usuário/dia).
--  * Admins ficam fora de todas as métricas (contas de teste/operação).
--  * Datas no fuso America/Sao_Paulo.
--  * Em funções com RETURNS TABLE os nomes das colunas de saída viram
--    variáveis plpgsql: toda coluna de tabela é qualificada com alias.

-- ---------------------------------------------------------------------------
-- KPIs do período atual vs. período anterior de mesmo tamanho.
-- ---------------------------------------------------------------------------
create or replace function public.admin_kpis(days_back int default 30)
returns table (
  total_users bigint,
  never_trained bigint,
  signups_cur bigint, signups_prev bigint,
  active_cur bigint, active_prev bigint,
  sessions_cur bigint, sessions_prev bigint,
  rating_cur numeric, rating_prev numeric,
  duration_min_cur numeric, duration_min_prev numeric,
  dau bigint, wau bigint, mau bigint
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
      select u.id as uid, (u.created_at at time zone 'America/Sao_Paulo')::date as created_day
      from auth.users u
      left join public.profiles p on p.id = u.id
      where not coalesce(p.is_admin, false)
    ),
    td as (
      select t.user_id as uid, t.day as d
      from public.training_days() t
      join nonadmin n on n.uid = t.user_id
    ),
    wk as (
      select w.workout_date as d, w.rating::numeric as rating, w.duration_seconds as dur
      from public.workouts w
      join nonadmin n on n.uid = w.user_id
      where w.completed or w.finished_at is not null
    )
    select
      (select count(*) from nonadmin),
      (select count(*) from nonadmin n where not exists (select 1 from td t where t.uid = n.uid)),
      (select count(*) from nonadmin n where n.created_day > today - days_back),
      (select count(*) from nonadmin n where n.created_day > today - 2 * days_back and n.created_day <= today - days_back),
      (select count(distinct t.uid) from td t where t.d > today - days_back),
      (select count(distinct t.uid) from td t where t.d > today - 2 * days_back and t.d <= today - days_back),
      (select count(*) from td t where t.d > today - days_back),
      (select count(*) from td t where t.d > today - 2 * days_back and t.d <= today - days_back),
      (select round(avg(k.rating), 2) from wk k where k.rating is not null and k.d > today - days_back),
      (select round(avg(k.rating), 2) from wk k where k.rating is not null and k.d > today - 2 * days_back and k.d <= today - days_back),
      (select round(avg(k.dur) / 60.0, 1) from wk k where k.dur > 0 and k.d > today - days_back),
      (select round(avg(k.dur) / 60.0, 1) from wk k where k.dur > 0 and k.d > today - 2 * days_back and k.d <= today - days_back),
      (select count(distinct t.uid) from td t where t.d = today),
      (select count(distinct t.uid) from td t where t.d > today - 7),
      (select count(distinct t.uid) from td t where t.d > today - 30);
end;
$$;

grant execute on function public.admin_kpis(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Série diária: treinos, usuários ativos e cadastros.
-- ---------------------------------------------------------------------------
create or replace function public.admin_activity_by_day(days_back int default 30)
returns table (day date, sessions bigint, active_users bigint, signups bigint)
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
      select u.id as uid, (u.created_at at time zone 'America/Sao_Paulo')::date as created_day
      from auth.users u
      left join public.profiles p on p.id = u.id
      where not coalesce(p.is_admin, false)
    ),
    tdd as (
      select t.day as dd, count(*) as cnt, count(distinct t.user_id) as usr
      from public.training_days() t
      join nonadmin n on n.uid = t.user_id
      group by t.day
    ),
    sg as (
      select n.created_day as dd, count(*) as cnt from nonadmin n group by n.created_day
    )
    select g::date, coalesce(tdd.cnt, 0)::bigint, coalesce(tdd.usr, 0)::bigint, coalesce(sg.cnt, 0)::bigint
    from generate_series(today - (days_back - 1), today, interval '1 day') g
    left join tdd on tdd.dd = g::date
    left join sg on sg.dd = g::date
    order by g;
end;
$$;

grant execute on function public.admin_activity_by_day(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Usuários em risco: já treinaram mas sumiram há mais de N dias, ou
-- cadastraram há mais de 7 dias e nunca treinaram. Só contas confirmadas e
-- não banidas. Quem sumiu mais recentemente vem primeiro (mais recuperável).
-- ---------------------------------------------------------------------------
create or replace function public.admin_at_risk_users(inactive_days int default 14, max_rows int default 200)
returns table (
  id uuid,
  email text,
  nome text,
  apelido text,
  created_at timestamptz,
  last_training date,
  days_inactive int,
  trainings_total bigint,
  plan_end_date date
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
    with agg as (
      select t.user_id as uid, max(t.day) as last_day, count(*) as total
      from public.training_days() t
      group by t.user_id
    )
    select u.id, u.email::text, u.raw_user_meta_data->>'nome', u.raw_user_meta_data->>'apelido',
           u.created_at, a.last_day, (today - a.last_day)::int, coalesce(a.total, 0)::bigint,
           (select wp.end_date from public.workout_plans wp where wp.user_id = u.id and wp.is_active limit 1)
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join agg a on a.uid = u.id
    where not coalesce(p.is_admin, false)
      and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= now())
      and (
        (a.last_day is not null and a.last_day < today - inactive_days)
        or (a.last_day is null and (u.created_at at time zone 'America/Sao_Paulo')::date < today - 7)
      )
    order by a.last_day desc nulls last, u.created_at desc
    limit max_rows;
end;
$$;

grant execute on function public.admin_at_risk_users(int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Planos ativos vencidos ou vencendo nos próximos N dias.
-- ---------------------------------------------------------------------------
create or replace function public.admin_expiring_plans(days_ahead int default 7)
returns table (
  user_id uuid,
  email text,
  nome text,
  apelido text,
  plan_name text,
  end_date date,
  days_left int,
  has_next boolean
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
    select u.id, u.email::text, u.raw_user_meta_data->>'nome', u.raw_user_meta_data->>'apelido',
           wp.name, wp.end_date, (wp.end_date - today)::int, wp.next_plan_id is not null
    from public.workout_plans wp
    join auth.users u on u.id = wp.user_id
    left join public.profiles p on p.id = u.id
    where wp.is_active
      and wp.end_date is not null
      and wp.end_date <= today + days_ahead
      and not coalesce(p.is_admin, false)
      and (u.banned_until is null or u.banned_until <= now())
    order by wp.end_date asc;
end;
$$;

grant execute on function public.admin_expiring_plans(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Exercícios mais feitos (séries concluídas) no período.
-- ---------------------------------------------------------------------------
create or replace function public.admin_top_exercises(days_back int default 30, max_rows int default 10)
returns table (exercise_name text, sets_done bigint, users_count bigint, avg_carga numeric)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select es.exercise_name, count(*)::bigint, count(distinct w.user_id)::bigint,
           round((avg(es.carga) filter (where es.carga > 0))::numeric, 1)
    from public.exercise_sets es
    join public.workouts w on w.id = es.workout_id
    where es.completed
      and w.workout_date > today - days_back
      and not exists (select 1 from public.profiles p where p.id = w.user_id and p.is_admin)
    group by es.exercise_name
    order by 2 desc
    limit max_rows;
end;
$$;

grant execute on function public.admin_top_exercises(int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Perfil do público: distribuição por meta, nível e sexo.
-- ---------------------------------------------------------------------------
create or replace function public.admin_profile_distribution()
returns table (dimension text, value text, total bigint)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with us as (
      select u.raw_user_meta_data as md
      from auth.users u
      left join public.profiles p on p.id = u.id
      where not coalesce(p.is_admin, false)
    )
    select 'meta'::text, coalesce(nullif(us.md->>'meta', ''), 'não informado'), count(*)::bigint from us group by 2
    union all
    select 'nivel'::text, coalesce(nullif(us.md->>'nivel', ''), 'não informado'), count(*)::bigint from us group by 2
    union all
    select 'sexo'::text, coalesce(nullif(us.md->>'sexo', ''), 'não informado'), count(*)::bigint from us group by 2;
end;
$$;

grant execute on function public.admin_profile_distribution() to authenticated;

-- ---------------------------------------------------------------------------
-- Lista de usuários: engajamento, ordenação e filtros de nível/meta.
-- Substitui a versão de 20261006000000 (tipo de retorno muda, então drop antes).
-- Status extras: 'inactive' (confirmado, já treinou, sem treino há 14+ dias),
-- 'never_trained' (confirmado e nunca treinou).
-- ---------------------------------------------------------------------------
drop function if exists public.admin_list_users_page(text, text, int, int);

create function public.admin_list_users_page(
  search text default null,
  status_filter text default null,
  page_size int default 50,
  page_offset int default 0,
  sort_by text default 'created_desc', -- created_desc|created_asc|login_desc|training_desc|training_asc|trainings_desc
  nivel_filter text default null,
  meta_filter text default null
)
returns table (
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  is_admin boolean,
  nome text,
  sobrenome text,
  apelido text,
  peso_alvo text,
  nivel text,
  meta text,
  last_training date,
  trainings_30d bigint,
  plan_end_date date,
  total_count bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  return query
    with agg as (
      select t.user_id as uid, max(t.day) as last_day,
             count(*) filter (where t.day > today - 30) as t30
      from public.training_days() t
      group by t.user_id
    ),
    base as (
      select u.id, u.email::text as email, u.created_at, u.last_sign_in_at, u.email_confirmed_at,
             u.banned_until, coalesce(p.is_admin, false) as is_admin,
             u.raw_user_meta_data->>'nome' as nome,
             u.raw_user_meta_data->>'sobrenome' as sobrenome,
             u.raw_user_meta_data->>'apelido' as apelido,
             u.raw_user_meta_data->>'pesoAlvo' as peso_alvo,
             u.raw_user_meta_data->>'nivel' as nivel,
             u.raw_user_meta_data->>'meta' as meta,
             a.last_day as last_training,
             coalesce(a.t30, 0)::bigint as trainings_30d,
             (select wp.end_date from public.workout_plans wp where wp.user_id = u.id and wp.is_active limit 1) as plan_end_date
      from auth.users u
      left join public.profiles p on p.id = u.id
      left join agg a on a.uid = u.id
      where (search is null or search = ''
             or u.email ilike '%' || search || '%'
             or (u.raw_user_meta_data->>'nome') ilike '%' || search || '%'
             or (u.raw_user_meta_data->>'sobrenome') ilike '%' || search || '%'
             or (u.raw_user_meta_data->>'apelido') ilike '%' || search || '%')
        and (nivel_filter is null or nivel_filter = '' or u.raw_user_meta_data->>'nivel' = nivel_filter)
        and (meta_filter is null or meta_filter = '' or u.raw_user_meta_data->>'meta' = meta_filter)
        and (
          status_filter is null or status_filter = ''
          or (status_filter = 'admin' and coalesce(p.is_admin, false))
          or (status_filter = 'banned' and u.banned_until is not null and u.banned_until > now())
          or (status_filter = 'unconfirmed' and u.email_confirmed_at is null)
          or (status_filter = 'active' and not coalesce(p.is_admin, false)
              and (u.banned_until is null or u.banned_until <= now())
              and u.email_confirmed_at is not null)
          or (status_filter = 'inactive' and not coalesce(p.is_admin, false)
              and u.email_confirmed_at is not null
              and a.last_day is not null and a.last_day < today - 14)
          or (status_filter = 'never_trained' and not coalesce(p.is_admin, false)
              and u.email_confirmed_at is not null and a.last_day is null)
        )
    )
    select b.*, count(*) over()::bigint as total_count
    from base b
    order by
      case when sort_by = 'created_asc' then b.created_at end asc,
      case when sort_by = 'login_desc' then b.last_sign_in_at end desc nulls last,
      case when sort_by = 'training_desc' then b.last_training end desc nulls last,
      case when sort_by = 'training_asc' then b.last_training end asc nulls first,
      case when sort_by = 'trainings_desc' then b.trainings_30d end desc,
      b.created_at desc
    limit page_size offset page_offset;
end;
$$;

grant execute on function public.admin_list_users_page(text, text, int, int, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Notas internas por usuário (só admin lê/escreve).
-- ---------------------------------------------------------------------------
create table if not exists public.admin_user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  admin_id uuid references auth.users(id) on delete set null,
  admin_email text,
  note text not null check (length(btrim(note)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists admin_user_notes_user_idx on public.admin_user_notes (user_id, created_at desc);

alter table public.admin_user_notes enable row level security;

drop policy if exists "admin full access" on public.admin_user_notes;
create policy "admin full access" on public.admin_user_notes
  for all using (public.is_admin()) with check (public.is_admin());
