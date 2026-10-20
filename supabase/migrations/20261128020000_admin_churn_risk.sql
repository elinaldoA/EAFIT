-- Painel admin: previsão de abandono (Análises → Engajamento). Nota de 0 a 100
-- para quem ainda treina (2+ dias de treino nos últimos 60 e o último há no
-- máximo 45 dias) — quem já sumiu continua na lista "Em risco de abandono".
--
-- Pontos (somados, teto 100):
--   intervalo   até 40  dias sem treinar além do intervalo habitual da pessoa
--   queda       até 25  treinos nos últimos 14 dias contra a média de 14 dias
--                       das 4 semanas anteriores
--   bem_estar   até 15  média de energia, sono e humor do check-in (14 dias)
--   desconforto    10   desconforto forte ou lesão nos últimos 21 dias
--   plano          10   sem plano ativo ou plano vencido (5 se vence em 3 dias)
--   sem_abrir      10   não abriu o app nos últimos 7 dias
-- last_contact = último aviso recebido no sino (manual ou automático); a fila
-- "contatar hoje" do painel deixa de fora quem recebeu algo nos últimos 3 dias.
create or replace function public.admin_churn_risk(max_rows int default 300)
returns table (
  cr_user uuid, cr_email text, cr_name text,
  cr_score int, cr_reasons text[],
  cr_last_day date, cr_days_since int, cr_typical_gap numeric,
  cr_recent14 bigint, cr_prev14 numeric, cr_wellbeing numeric,
  cr_plan_end date, cr_last_open date, cr_last_contact timestamptz
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
    with td as (
      select t.user_id, t.day from public.training_days() t where t.day >= today - 60 and t.day <= today
    ),
    agg as (
      select td.user_id,
             count(*) as n60,
             min(td.day) as first_day,
             max(td.day) as last_day,
             count(*) filter (where td.day > today - 14) as recent14,
             (count(*) filter (where td.day <= today - 14 and td.day > today - 42))::numeric / 2 as prev14
      from td group by td.user_id
    ),
    base as (
      select u.id, u.email::text as email,
             coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), u.email::text) as name,
             a.last_day, (today - a.last_day)::int as ds,
             greatest(1, (a.last_day - a.first_day)::numeric / greatest(a.n60 - 1, 1)) as typical,
             a.recent14, a.prev14,
             (select round(avg((c.energy + c.sleep + c.mood)::numeric / 3), 1) from public.daily_checkins c
               where c.user_id = u.id and c.checkin_date > today - 14) as wb,
             exists (select 1 from public.exercise_discomfort d
                      where d.user_id = u.id and d.severity in ('forte', 'lesao') and d.log_date > today - 21) as hurt,
             (select wp.end_date from public.workout_plans wp where wp.user_id = u.id and wp.is_active
               order by wp.end_date desc nulls last limit 1) as plan_end,
             exists (select 1 from public.workout_plans wp where wp.user_id = u.id and wp.is_active) as has_plan,
             (select max(x.day) from public.app_access_days x where x.user_id = u.id) as last_open,
             (select max(un.created_at) from public.user_notifications un where un.user_id = u.id) as last_contact
      from agg a
      join auth.users u on u.id = a.user_id
      left join public.profiles p on p.id = u.id
      where a.n60 >= 2 and a.last_day >= today - 45
        and not coalesce(p.is_admin, false)
        and (u.banned_until is null or u.banned_until <= now())
        and coalesce(u.raw_user_meta_data->>'pausedUntil', '') < today::text
    ),
    pts as (
      select b.*,
             least(40, round(greatest(0, b.ds / b.typical - 1) * 15))::int as p_gap,
             case when b.prev14 > 0 then least(25, round(greatest(0, 1 - b.recent14 / b.prev14) * 25))::int else 0 end as p_drop,
             case when b.wb is null then 0 when b.wb < 2.5 then 15 when b.wb < 3 then 8 else 0 end as p_wb,
             case when b.hurt then 10 else 0 end as p_hurt,
             case when not b.has_plan or (b.plan_end is not null and b.plan_end < today) then 10
                  when b.plan_end is not null and b.plan_end <= today + 3 then 5 else 0 end as p_plan,
             case when b.last_open is null or b.last_open < today - 7 then 10 else 0 end as p_open
      from base b
    )
    select x.id, x.email, x.name,
           least(100, x.p_gap + x.p_drop + x.p_wb + x.p_hurt + x.p_plan + x.p_open)::int,
           array_remove(array[
             case when x.p_gap > 0 then 'intervalo' end,
             case when x.p_drop > 0 then 'queda' end,
             case when x.p_wb > 0 then 'bem_estar' end,
             case when x.p_hurt > 0 then 'desconforto' end,
             case when x.p_plan > 0 then 'plano' end,
             case when x.p_open > 0 then 'sem_abrir' end
           ], null),
           x.last_day, x.ds, round(x.typical, 1), x.recent14, round(x.prev14, 1), x.wb,
           x.plan_end, x.last_open, x.last_contact
    from pts x
    order by 4 desc, x.ds desc
    limit greatest(1, least(coalesce(max_rows, 300), 1000));
end;
$$;

revoke execute on function public.admin_churn_risk(int) from public, anon;
grant execute on function public.admin_churn_risk(int) to authenticated;
