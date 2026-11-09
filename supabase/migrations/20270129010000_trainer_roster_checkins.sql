-- Carteira do personal com os check-ins recentes do aluno.
--
-- trainer_roster passa a devolver, no fim, a quantidade e as medias de energia
-- e sono dos check-ins diarios dos ultimos 4 dias (hoje e os 3 anteriores).
-- O Painel usa isso para por na fila 'Precisam de voce' quem anda cansado ou
-- dormindo mal. Nada mais muda: as colunas antigas seguem iguais e as versoes
-- antigas do app ignoram as novas.

drop function if exists public.trainer_roster();

create function public.trainer_roster()
returns table (
  rs_id uuid,
  rs_name text,
  rs_email text,
  rs_since timestamptz,
  rs_last_day date,
  rs_days_7 int,
  rs_days_30 int,
  rs_paused boolean,
  rs_goal text,
  rs_level text,
  rs_weekly_goal int,
  rs_plan_name text,
  rs_plan_days int,
  rs_plan_end date,
  rs_plan_by_me boolean,
  rs_pain_7 int,
  rs_tags text[],
  rs_recent date[],
  rs_chk_n int,
  rs_chk_energy numeric,
  rs_chk_sleep numeric
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
      where d.user_id in (select m.client_id from mine m)
    ),
    agg as (
      select td.user_id,
             max(td.day) as last_day,
             count(*) filter (where td.day >= today - 6)::int as d7,
             count(*) filter (where td.day >= today - 29)::int as d30,
             array_agg(td.day order by td.day) filter (where td.day >= today - 13) as recent
      from td
      group by td.user_id
    )
    select m.client_id,
           coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), split_part(u.email::text, '@', 1)),
           u.email::text,
           m.linked_at,
           a.last_day,
           coalesce(a.d7, 0),
           coalesce(a.d30, 0),
           case
             when (u.raw_user_meta_data->>'pausedUntil') ~ '^\d{4}-\d{2}-\d{2}$'
             then (u.raw_user_meta_data->>'pausedUntil') >= today::text
             else false
           end,
           u.raw_user_meta_data->>'meta',
           u.raw_user_meta_data->>'nivel',
           case when (u.raw_user_meta_data->>'weeklyGoal') ~ '^[1-7]$' then (u.raw_user_meta_data->>'weeklyGoal')::int end,
           p.name,
           p.days,
           p.end_date,
           p.by_me,
           (select count(*) from public.exercise_discomfort x
             where x.user_id = m.client_id and x.severity in ('forte', 'lesao') and x.log_date >= today - 6)::int,
           coalesce(meta.tags, '{}'),
           coalesce(a.recent, '{}'),
           coalesce(k.n, 0),
           k.energy,
           k.sleep
    from mine m
    join auth.users u on u.id = m.client_id
    left join agg a on a.user_id = m.client_id
    left join public.trainer_client_meta meta on meta.trainer_id = auth.uid() and meta.client_id = m.client_id
    left join lateral (
      select count(*)::int as n, round(avg(ck.energy), 1) as energy, round(avg(ck.sleep), 1) as sleep
      from public.daily_checkins ck
      where ck.user_id = m.client_id and ck.checkin_date >= today - 3
    ) k on true
    left join lateral (
      select wp.name, wp.end_date, wp.created_by = auth.uid() as by_me,
             (select count(*) from public.plan_days pd where pd.plan_id = wp.id)::int as days
      from public.workout_plans wp
      where wp.user_id = m.client_id and wp.is_active
      limit 1
    ) p on true
    order by a.last_day desc nulls last;
end;
$$;

revoke execute on function public.trainer_roster() from public, anon;
grant execute on function public.trainer_roster() to authenticated;
