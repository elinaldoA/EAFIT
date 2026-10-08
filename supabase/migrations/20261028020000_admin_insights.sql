-- Painel admin: análises do que o app registra e o painel ainda não mostrava —
-- check-in diário, medidas corporais, hidratação, cardio, conquistas, cargas
-- por exercício e o caminho do convite.
--
-- Tudo agregado e sem contas de admin (teste/operação), como nas demais
-- análises. `days_back` nulo ou <= 0 = todo o histórico, exceto nas séries por
-- dia, que são limitadas a 180 dias.
--
-- Colunas de saída prefixadas: em RETURNS TABLE elas viram variáveis plpgsql.

-- ---------------------------------------------------------------------------
-- Check-in e medidas: o admin lê (para o detalhe do usuário), não escreve.
-- ---------------------------------------------------------------------------
drop policy if exists "admin reads checkins" on public.daily_checkins;
create policy "admin reads checkins" on public.daily_checkins
  for select using (public.is_admin());

drop policy if exists "admin reads measurements" on public.body_measurements;
create policy "admin reads measurements" on public.body_measurements
  for select using (public.is_admin());

-- Meta diária de água em ml, pela mesma regra do app (getWaterGoalLiters em
-- app-react/src/data/treinoData.js): valor próprio do perfil (macroAgua, em
-- litros), senão 35 ml por kg, senão 3,5 L. Valor que não é número é ignorado.
create or replace function public.admin_water_goal_ml(md jsonb)
returns numeric
language sql
immutable
set search_path = public
as $$
  select coalesce(
    case when (md->>'macroAgua') ~ '^\d+([.,]\d+)?$' and replace(md->>'macroAgua', ',', '.')::numeric > 0
         then replace(md->>'macroAgua', ',', '.')::numeric * 1000 end,
    case when (md->>'peso') ~ '^\d+([.,]\d+)?$' and replace(md->>'peso', ',', '.')::numeric > 0
         then round(replace(md->>'peso', ',', '.')::numeric * 0.035, 1) * 1000 end,
    3500
  );
$$;

revoke execute on function public.admin_water_goal_ml(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Resumo do período: check-in, medidas e água numa linha só.
-- wo_low_users = quem fez 3+ check-ins e ficou com média de energia ou de
-- sono em 2 ou menos (de 1 a 5).
-- ---------------------------------------------------------------------------
create or replace function public.admin_wellbeing_overview(days_back int default 30)
returns table (
  wo_users bigint,
  wo_checkin_users bigint, wo_checkins bigint, wo_energy numeric, wo_sleep numeric, wo_mood numeric,
  wo_low_users bigint,
  wo_measure_users bigint, wo_measures bigint,
  wo_water_users bigint, wo_water_days bigint, wo_water_avg_ml numeric, wo_water_hit_days bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  since date := case when days_back is null or days_back <= 0 then null
                     else (now() at time zone 'America/Sao_Paulo')::date - (days_back - 1) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with nonadmin as (
      select u.id as uid, u.raw_user_meta_data as md
      from auth.users u
      left join public.profiles p on p.id = u.id
      where not coalesce(p.is_admin, false)
    ),
    ck as (
      select c.user_id as uid, c.energy as en, c.sleep as sl, c.mood as mo
      from public.daily_checkins c
      join nonadmin n on n.uid = c.user_id
      where since is null or c.checkin_date >= since
    ),
    per_user as (
      select ck.uid, count(*) as n, avg(ck.en) as en, avg(ck.sl) as sl from ck group by ck.uid
    ),
    ms as (
      select m.user_id as uid
      from public.body_measurements m
      join nonadmin n on n.uid = m.user_id
      where since is null or m.measured_on >= since
    ),
    wt as (
      select w.user_id as uid, w.amount_ml as ml, public.admin_water_goal_ml(n.md) as goal
      from public.water_logs w
      join nonadmin n on n.uid = w.user_id
      where w.amount_ml > 0 and (since is null or w.log_date >= since)
    )
    select
      (select count(*) from nonadmin),
      (select count(distinct ck.uid) from ck),
      (select count(*) from ck),
      (select round(avg(ck.en), 1) from ck),
      (select round(avg(ck.sl), 1) from ck),
      (select round(avg(ck.mo), 1) from ck),
      (select count(*) from per_user pu where pu.n >= 3 and (pu.en <= 2 or pu.sl <= 2)),
      (select count(distinct ms.uid) from ms),
      (select count(*) from ms),
      (select count(distinct wt.uid) from wt),
      (select count(*) from wt),
      (select round(avg(wt.ml)) from wt),
      (select count(*) from wt where wt.ml >= wt.goal);
end;
$$;

-- Série diária (até 180 dias): médias do check-in e água registrada.
create or replace function public.admin_wellbeing_by_day(days_back int default 30)
returns table (
  wd_day date, wd_checkins bigint, wd_energy numeric, wd_sleep numeric, wd_mood numeric,
  wd_water_users bigint, wd_water_avg_ml numeric, wd_water_hits bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  n int := least(greatest(coalesce(days_back, 30), 1), 180);
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with nonadmin as (
      select u.id as uid, u.raw_user_meta_data as md
      from auth.users u
      left join public.profiles p on p.id = u.id
      where not coalesce(p.is_admin, false)
    ),
    days as (
      select g::date as d from generate_series(today - (n - 1), today, interval '1 day') g
    ),
    ck as (
      select c.checkin_date as d, count(*) as total,
             round(avg(c.energy), 1) as en, round(avg(c.sleep), 1) as sl, round(avg(c.mood), 1) as mo
      from public.daily_checkins c
      join nonadmin na on na.uid = c.user_id
      where c.checkin_date >= today - (n - 1)
      group by c.checkin_date
    ),
    wt as (
      select w.log_date as d, count(*) as total, round(avg(w.amount_ml)) as avg_ml,
             count(*) filter (where w.amount_ml >= public.admin_water_goal_ml(na.md)) as hits
      from public.water_logs w
      join nonadmin na on na.uid = w.user_id
      where w.amount_ml > 0 and w.log_date >= today - (n - 1)
      group by w.log_date
    )
    select days.d, coalesce(ck.total, 0)::bigint, ck.en, ck.sl, ck.mo,
           coalesce(wt.total, 0)::bigint, wt.avg_ml, coalesce(wt.hits, 0)::bigint
    from days
    left join ck on ck.d = days.d
    left join wt on wt.d = days.d
    order by days.d;
end;
$$;

-- Quem está com energia ou sono baixos no período (3+ check-ins, média <= 2).
create or replace function public.admin_low_checkin_users(days_back int default 30, max_rows int default 50)
returns table (
  lc_user uuid, lc_email text, lc_name text, lc_checkins bigint,
  lc_energy numeric, lc_sleep numeric, lc_mood numeric, lc_last date
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  since date := case when days_back is null or days_back <= 0 then null
                     else (now() at time zone 'America/Sao_Paulo')::date - (days_back - 1) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select c.user_id, u.email::text,
           coalesce(nullif(btrim(u.raw_user_meta_data->>'apelido'), ''),
                    nullif(btrim(u.raw_user_meta_data->>'nome'), ''),
                    split_part(u.email::text, '@', 1)),
           count(*)::bigint, round(avg(c.energy), 1), round(avg(c.sleep), 1), round(avg(c.mood), 1),
           max(c.checkin_date)
    from public.daily_checkins c
    join auth.users u on u.id = c.user_id
    left join public.profiles p on p.id = c.user_id
    where not coalesce(p.is_admin, false) and (since is null or c.checkin_date >= since)
    group by c.user_id, u.email, u.raw_user_meta_data
    having count(*) >= 3 and (avg(c.energy) <= 2 or avg(c.sleep) <= 2)
    order by least(avg(c.energy), avg(c.sleep)), count(*) desc
    limit least(greatest(coalesce(max_rows, 50), 1), 200);
end;
$$;

-- ---------------------------------------------------------------------------
-- Cardio: itens registrados com duração ou distância (exercise_sets, ver
-- 20261021010000_cardio_logging.sql). A linha '__total__' soma tudo.
-- ---------------------------------------------------------------------------
create or replace function public.admin_cardio_summary(days_back int default 30)
returns table (cs_exercise text, cs_sessions bigint, cs_users bigint, cs_minutes numeric, cs_km numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since date := case when days_back is null or days_back <= 0 then null
                     else (now() at time zone 'America/Sao_Paulo')::date - (days_back - 1) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with c as (
      select es.exercise_name as ex, w.id as wid, w.user_id as uid,
             coalesce(es.duracao_min, 0) as mins, coalesce(es.distancia_km, 0) as km
      from public.exercise_sets es
      join public.workouts w on w.id = es.workout_id
      left join public.profiles p on p.id = w.user_id
      where (coalesce(es.duracao_min, 0) > 0 or coalesce(es.distancia_km, 0) > 0)
        and (since is null or w.workout_date >= since)
        and not coalesce(p.is_admin, false)
    )
    (select '__total__'::text, count(distinct c.wid)::bigint, count(distinct c.uid)::bigint,
            coalesce(round(sum(c.mins)), 0), coalesce(round(sum(c.km), 1), 0)
     from c)
    union all
    (select c.ex, count(distinct c.wid)::bigint, count(distinct c.uid)::bigint,
            round(sum(c.mins)), round(sum(c.km), 1)
     from c group by c.ex
     order by count(distinct c.wid) desc, c.ex
     limit 15);
end;
$$;

-- ---------------------------------------------------------------------------
-- Conquistas: quantos usuários desbloquearam cada uma. A linha '__users__'
-- traz a base (usuários não admin) para calcular o percentual.
-- ---------------------------------------------------------------------------
create or replace function public.admin_achievement_stats()
returns table (as_badge text, as_users bigint, as_last timestamptz)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    (select '__users__'::text, count(*)::bigint, null::timestamptz
     from auth.users u
     left join public.profiles p on p.id = u.id
     where not coalesce(p.is_admin, false))
    union all
    (select a.badge_id, count(*)::bigint, max(a.unlocked_at)
     from public.achievements a
     left join public.profiles p on p.id = a.user_id
     where not coalesce(p.is_admin, false)
     group by a.badge_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Cargas por exercício: quantos usuários registram carga, a maior carga e a
-- média da melhor carga de cada um. (A tabela personal_records nunca foi
-- usada: recorde é sempre calculado a partir de exercise_sets.)
-- ---------------------------------------------------------------------------
create or replace function public.admin_record_stats(days_back int default 90, max_rows int default 15)
returns table (rs_exercise text, rs_users bigint, rs_top numeric, rs_avg_best numeric, rs_sets bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since date := case when days_back is null or days_back <= 0 then null
                     else (now() at time zone 'America/Sao_Paulo')::date - (days_back - 1) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with best as (
      select es.exercise_name as ex, w.user_id as uid, max(es.carga) as top, count(*) as n
      from public.exercise_sets es
      join public.workouts w on w.id = es.workout_id
      left join public.profiles p on p.id = w.user_id
      where es.completed and es.carga > 0
        and (since is null or w.workout_date >= since)
        and not coalesce(p.is_admin, false)
      group by es.exercise_name, w.user_id
    )
    select best.ex, count(*)::bigint, max(best.top), round(avg(best.top), 1), sum(best.n)::bigint
    from best
    group by best.ex
    order by count(*) desc, max(best.top) desc, best.ex
    limit least(greatest(coalesce(max_rows, 15), 1), 100);
end;
$$;

-- ---------------------------------------------------------------------------
-- Convite: quem tocou em "Convidar amigos" (user_events feature/invite), as
-- visitas que chegaram com ?origem=convite e os cadastros do período. Não há
-- como ligar um cadastro a um convite específico (as visitas são anônimas),
-- então if_signups é o total de cadastros, só como referência.
-- ---------------------------------------------------------------------------
create or replace function public.admin_invite_funnel(days_back int default 30)
returns table (if_share_users bigint, if_share_days bigint, if_landing bigint, if_acesso bigint, if_signups bigint)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  since date := case when days_back is null or days_back <= 0 then null
                     else (now() at time zone 'America/Sao_Paulo')::date - (days_back - 1) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with sh as (
      select e.user_id as uid
      from public.user_events e
      left join public.profiles p on p.id = e.user_id
      where e.event = 'feature' and e.detail = 'invite'
        and (since is null or e.day >= since)
        and not coalesce(p.is_admin, false)
    )
    select
      (select count(distinct sh.uid) from sh),
      (select count(*) from sh),
      (select count(*) from public.page_visits v
        where v.source = 'convite' and v.page = 'landing' and (since is null or v.visited_on >= since)),
      (select count(*) from public.page_visits v
        where v.source = 'convite' and v.page = 'acesso' and (since is null or v.visited_on >= since)),
      (select count(*) from auth.users u
        left join public.profiles p on p.id = u.id
        where not coalesce(p.is_admin, false)
          and (since is null or (u.created_at at time zone 'America/Sao_Paulo')::date >= since));
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'admin_wellbeing_overview(int)', 'admin_wellbeing_by_day(int)', 'admin_low_checkin_users(int, int)',
    'admin_cardio_summary(int)', 'admin_achievement_stats()', 'admin_record_stats(int, int)',
    'admin_invite_funnel(int)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
