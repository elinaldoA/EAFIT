-- Funil de ativação e retenção por coorte no painel admin, e correção dos
-- números de treino do dashboard.
--
-- Por que os números antigos estavam errados: o app cria uma linha em
-- public.workouts pra CADA dia do plano assim que é aberto na semana
-- (ensureWorkoutId em app-react/src/context/WorkoutContext.jsx, chamado no
-- carregamento). Contar linhas de workouts mede "abriu o app", não "treinou".
--
-- training_days() é a definição única de "treinou": um workout conta se foi
-- concluído, finalizado no modo ao vivo ou tem ao menos uma série marcada
-- como feita. O dia é o do começo real da atividade (started_at, primeira
-- série feita ou finished_at, no fuso de Brasília), caindo em workout_date
-- só quando nenhum horário existe (ex.: marcou o dia como concluído direto).
-- Um usuário treinou no máximo uma vez por dia (distinct).
--
-- Admins ficam fora do funil e da retenção (são contas de teste/operação e
-- distorcem coortes pequenas).

create or replace function public.training_days()
returns table (user_id uuid, day date)
language sql
stable
security definer
set search_path = public
as $$
  select distinct
    w.user_id,
    coalesce(
      (coalesce(w.started_at, s.first_set_at, w.finished_at) at time zone 'America/Sao_Paulo')::date,
      w.workout_date
    )
  from public.workouts w
  left join lateral (
    select min(es.updated_at) as first_set_at
    from public.exercise_sets es
    where es.workout_id = w.id and es.completed
  ) s on true
  where w.completed or w.finished_at is not null or s.first_set_at is not null;
$$;

-- Só as funções admin (security definer) chamam isto; ninguém mais lê dados
-- de treino de todos os usuários.
revoke execute on function public.training_days() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard: mesmas colunas de antes, agora com treino de verdade.
-- ---------------------------------------------------------------------------
create or replace function public.admin_dashboard_stats()
returns table (
  total_users bigint,
  users_last_7d bigint,
  users_last_30d bigint,
  confirmed_users bigint,
  banned_users bigint,
  admins_count bigint,
  total_workouts bigint,
  workouts_last_7d bigint,
  active_users_7d bigint,
  push_enabled_users bigint,
  severe_discomfort_30d bigint
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
    with td as (select t.user_id as uid, t.day as d from public.training_days() t)
    select
      (select count(*) from auth.users),
      (select count(*) from auth.users where created_at >= now() - interval '7 days'),
      (select count(*) from auth.users where created_at >= now() - interval '30 days'),
      (select count(*) from auth.users where email_confirmed_at is not null),
      (select count(*) from auth.users where banned_until is not null and banned_until > now()),
      (select count(*) from public.profiles where is_admin),
      (select count(*) from td),
      (select count(*) from td where d > today - 7),
      (select count(distinct uid) from td where d > today - 7),
      (select count(distinct ps.user_id) from public.push_subscriptions ps),
      (select count(*) from public.exercise_discomfort
         where severity in ('forte', 'lesao') and log_date >= current_date - interval '30 days');
end;
$$;

grant execute on function public.admin_dashboard_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- Funil de ativação dos usuários cadastrados nos últimos `days_back` dias
-- (null ou <= 0 = todos). Cada etapa é subconjunto prático da anterior:
--   cadastrou → confirmou e-mail → preencheu o perfil (onboarding salva
--   user_metadata.peso, mesma checagem de App.jsx) → 1º treino → 2º treino
--   em até 7 dias depois do 1º.
-- ---------------------------------------------------------------------------
create or replace function public.admin_funnel(days_back int default 30)
returns table (
  signed_up bigint,
  confirmed bigint,
  onboarded bigint,
  first_workout bigint,
  second_workout_7d bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with cohort as (
      select u.id as uid, u.email_confirmed_at as confirmed_at, u.raw_user_meta_data as meta
      from auth.users u
      left join public.profiles p on p.id = u.id
      where not coalesce(p.is_admin, false)
        and (days_back is null or days_back <= 0 or u.created_at >= now() - make_interval(days => days_back))
    ),
    td as (
      select t.user_id as uid, t.day as d
      from public.training_days() t
      join cohort c on c.uid = t.user_id
    ),
    firsts as (select td.uid, min(td.d) as first_d from td group by td.uid)
    select
      (select count(*) from cohort),
      (select count(*) from cohort where confirmed_at is not null),
      (select count(*) from cohort where coalesce(meta->>'peso', '') <> ''),
      (select count(*) from firsts),
      (select count(*) from firsts f
         where exists (select 1 from td where td.uid = f.uid and td.d > f.first_d and td.d <= f.first_d + 7));
end;
$$;

grant execute on function public.admin_funnel(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Retenção por coorte semanal: usuários agrupados pela semana (seg–dom) do
-- cadastro, nas últimas `weeks` semanas. week_index k = treinou entre os dias
-- 7k e 7k+6 contados do PRÓPRIO dia de cadastro (semana 0 = primeira semana
-- de uso). Só vêm células cuja janela já começou pra alguém da coorte;
-- `complete` = a janela já terminou pra todos (quem entrou no domingo
-- inclusive) — célula incompleta ainda pode subir.
-- ---------------------------------------------------------------------------
create or replace function public.admin_retention_cohorts(weeks int default 8)
returns table (
  cohort_week date,
  cohort_size bigint,
  week_index int,
  active_users bigint,
  complete boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  first_week date := date_trunc('week', today)::date - 7 * (greatest(weeks, 1) - 1);
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with members as (
      select u.id as uid,
             (u.created_at at time zone 'America/Sao_Paulo')::date as signup_d
      from auth.users u
      left join public.profiles p on p.id = u.id
      where not coalesce(p.is_admin, false)
        and (u.created_at at time zone 'America/Sao_Paulo')::date >= first_week
    ),
    m as (select members.uid, members.signup_d, date_trunc('week', members.signup_d)::date as cw from members),
    sizes as (select m.cw, count(*) as n from m group by m.cw),
    grid as (
      select s.cw, s.n, k.k
      from sizes s
      cross join generate_series(0, greatest(weeks, 1) - 1) as k(k)
      where s.cw + 7 * k.k <= today
    ),
    act as (
      select m.cw, ((t.day - m.signup_d) / 7) as k, count(distinct m.uid) as n
      from m
      join public.training_days() t on t.user_id = m.uid
      where t.day >= m.signup_d
      group by m.cw, ((t.day - m.signup_d) / 7)
    )
    select g.cw, g.n, g.k::int, coalesce(a.n, 0)::bigint, (g.cw + 6 + 7 * g.k + 6) < today
    from grid g
    left join act a on a.cw = g.cw and a.k = g.k
    order by g.cw, g.k;
end;
$$;

grant execute on function public.admin_retention_cohorts(int) to authenticated;
