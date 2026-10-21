-- Terceiro local de treino: academia do condomínio (user_metadata.local =
-- 'condominio'). O app filtra os exercícios pelo equipamento de cada local
-- (EQUIPAMENTOS_POR_LOCAL em app-react/src/data/exerciseLibrary.js); aqui o
-- painel passa a separar condomínio de academia nas análises e a aceitar
-- "Treinam no condomínio" como público de pesquisas e experimentos.
-- Sem local (perfis antigos) continua contando como academia.

alter table public.surveys drop constraint surveys_audience_check;
alter table public.surveys add constraint surveys_audience_check
  check (audience in ('todos', 'ativos', 'novos', 'personal', 'academia', 'condominio', 'casa'));
alter table public.experiments drop constraint experiments_audience_check;
alter table public.experiments add constraint experiments_audience_check
  check (audience in ('todos', 'ativos', 'novos', 'personal', 'academia', 'condominio', 'casa'));

create or replace function public.admin_place_breakdown()
returns table (
  pb_place text, pb_users bigint, pb_with_plan bigint, pb_trained30 bigint, pb_never bigint,
  pb_sessions_week numeric, pb_cohort bigint, pb_cohort_active bigint, pb_pain bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with u as (
      select x.id,
             case when x.raw_user_meta_data->>'local' in ('casa', 'condominio') then x.raw_user_meta_data->>'local' else 'academia' end as place,
             (x.created_at at time zone 'America/Sao_Paulo')::date as joined
      from auth.users x
      left join public.profiles p on p.id = x.id
      where not coalesce(p.is_admin, false)
    ),
    td as (
      select t.user_id, count(*) filter (where t.day > today - 30) as s30,
             count(*) filter (where t.day > today - 14) as s14, count(*) as total
      from public.training_days() t group by t.user_id
    ),
    b as (
      select u.place, u.joined, coalesce(td.s30, 0) as s30, coalesce(td.s14, 0) as s14, coalesce(td.total, 0) as total,
             exists (select 1 from public.workout_plans wp where wp.user_id = u.id and wp.is_active) as has_plan,
             exists (select 1 from public.exercise_discomfort d
                      where d.user_id = u.id and d.severity in ('forte', 'lesao') and d.log_date > today - 30) as pain
      from u left join td on td.user_id = u.id
    )
    select b.place, count(*)::bigint,
           count(*) filter (where b.has_plan),
           count(*) filter (where b.s30 > 0),
           count(*) filter (where b.total = 0),
           round(avg(b.s30::numeric) filter (where b.has_plan) * 7 / 30, 1),
           count(*) filter (where b.joined between today - 84 and today - 28),
           count(*) filter (where b.joined between today - 84 and today - 28 and b.s14 > 0),
           count(*) filter (where b.pain)
    from b group by b.place;
end;
$$;

create or replace function public.survey_eligible(p_survey public.surveys, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from auth.users u
    left join public.profiles p on p.id = u.id
    where u.id = p_user
      and not coalesce(p.is_admin, false)
      and u.created_at <= now() - make_interval(days => p_survey.min_account_days)
      and case p_survey.audience
        when 'todos' then true
        when 'novos' then u.created_at >= now() - interval '30 days'
        when 'ativos' then exists (select 1 from public.training_days() t
                                    where t.user_id = u.id and t.day > (now() at time zone 'America/Sao_Paulo')::date - 30)
        when 'personal' then exists (select 1 from public.trainer_clients c where c.client_id = u.id and c.status = 'active')
        when 'casa' then u.raw_user_meta_data->>'local' = 'casa'
        when 'condominio' then u.raw_user_meta_data->>'local' = 'condominio'
        when 'academia' then coalesce(u.raw_user_meta_data->>'local', '') not in ('casa', 'condominio')
        else false
      end
  );
$$;

create or replace function public.admin_survey_answers(p_survey uuid)
returns table (
  sa_id bigint, sa_user uuid, sa_name text, sa_email text, sa_score smallint, sa_choice text, sa_comment text,
  sa_at timestamptz, sa_meta text, sa_nivel text, sa_local text, sa_personal boolean, sa_account_days int, sa_active30 boolean
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select a.id, a.user_id,
           coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), u.email::text),
           u.email::text, a.score, a.choice, a.comment, a.created_at,
           coalesce(nullif(u.raw_user_meta_data->>'meta', ''), 'não informado'),
           coalesce(nullif(u.raw_user_meta_data->>'nivel', ''), 'não informado'),
           case when u.raw_user_meta_data->>'local' in ('casa', 'condominio') then u.raw_user_meta_data->>'local' else 'academia' end,
           exists (select 1 from public.trainer_clients c where c.client_id = u.id and c.status = 'active'),
           (a.created_at::date - u.created_at::date)::int,
           exists (select 1 from public.training_days() t where t.user_id = u.id and t.day > today - 30)
    from public.survey_answers a
    join auth.users u on u.id = a.user_id
    where a.survey_id = p_survey
    order by a.created_at desc;
end;
$$;

create or replace function public.audience_match(p_audience text, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from auth.users u
    left join public.profiles p on p.id = u.id
    where u.id = p_user
      and not coalesce(p.is_admin, false)
      and case p_audience
        when 'todos' then true
        when 'novos' then u.created_at >= now() - interval '30 days'
        when 'ativos' then exists (select 1 from public.training_days() t
                                    where t.user_id = u.id and t.day > (now() at time zone 'America/Sao_Paulo')::date - 30)
        when 'personal' then exists (select 1 from public.trainer_clients c where c.client_id = u.id and c.status = 'active')
        when 'casa' then u.raw_user_meta_data->>'local' = 'casa'
        when 'condominio' then u.raw_user_meta_data->>'local' = 'condominio'
        when 'academia' then coalesce(u.raw_user_meta_data->>'local', '') not in ('casa', 'condominio')
        else false
      end
  );
$$;
