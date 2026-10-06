-- Modo pausa e horário preferido de treino.
--
-- Modo pausa (user_metadata.pausedUntil = 'YYYY-MM-DD', inclusive): quem está
-- viajando/doente pausa o app. Durante a pausa não recebe notificações de
-- engajamento (aqui) nem lembretes de sequência/inatividade (send-reminders) e
-- não aparece como "em risco de abandono" no painel. A sequência de treinos é
-- congelada no app (lib/pause.js).
--
-- Horário preferido (user_metadata.trainingHour = 0..23): a notificação "hoje é
-- dia de treino" chega 1h antes desse horário. Sem preferência, vale o horário
-- da regra, como antes. Pra isso a regra passa a rodar a cada hora
-- (per_user_hour) e engagement_candidates decide quem recebe em cada hora.
--
-- Convenções: datas/horas em America/Sao_Paulo; em funções com RETURNS TABLE as
-- colunas de saída viram variáveis plpgsql, então toda coluna é qualificada.
-- ATENÇÃO: nunca juntar um teste de regex e o cast do mesmo valor com AND (o
-- Postgres não garante a ordem e o cast pode rodar primeiro e estourar); use
-- CASE aninhado.

alter table public.engagement_rules
  add column if not exists per_user_hour boolean not null default false;

update public.engagement_rules
set per_user_hour = true,
    description = 'Lembra do treino planejado para hoje, para quem vinha treinando (últimos 14 dias) e ainda não treinou hoje. Quem definiu horário preferido no app recebe 1h antes dele; os demais, no horário abaixo.'
where kind = 'workout_today';

-- ---------------------------------------------------------------------------
-- Elegibilidade comum: agora também respeita o modo pausa.
-- ---------------------------------------------------------------------------
create or replace function public.engagement_eligible(rule_kind text, cooldown int)
returns table (uid uuid, md jsonb)
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id, u.raw_user_meta_data
  from auth.users u
  left join public.profiles p on p.id = u.id
  where not coalesce(p.is_admin, false)
    and (u.banned_until is null or u.banned_until <= now())
    and coalesce(u.raw_user_meta_data->>'notifyEngagement', 'true') <> 'false'
    -- modo pausa: pausedUntil é 'YYYY-MM-DD', então a comparação de texto vale
    and coalesce(u.raw_user_meta_data->>'pausedUntil', '')
        < ((now() at time zone 'America/Sao_Paulo')::date)::text
    and exists (select 1 from public.push_subscriptions ps where ps.user_id = u.id)
    -- intervalo mínimo deste tipo
    and not exists (
      select 1 from public.notification_log l
      where l.user_id = u.id and l.kind = rule_kind
        and (l.created_at at time zone 'America/Sao_Paulo')::date
            > (now() at time zone 'America/Sao_Paulo')::date - cooldown
    )
    -- no máximo 1 notificação de engajamento por dia, de qualquer tipo
    and not exists (
      select 1 from public.notification_log l
      where l.user_id = u.id
        and (l.created_at at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
    );
$$;

revoke execute on function public.engagement_eligible(text, int) from public, anon, authenticated;
grant execute on function public.engagement_eligible(text, int) to service_role;

-- ---------------------------------------------------------------------------
-- Candidatos: muda a assinatura (ignore_hour, usado pela prévia do painel),
-- então a versão antiga sai antes (senão a chamada só com rule_kind fica
-- ambígua entre as duas).
-- ---------------------------------------------------------------------------
drop function if exists public.admin_engagement_preview(text);
drop function if exists public.engagement_candidates(text);

create function public.engagement_candidates(rule_kind text, ignore_hour boolean default false)
returns table (user_id uuid, nome text, vars jsonb)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  dow int := extract(dow from (now() at time zone 'America/Sao_Paulo'))::int;
  hour_now int := extract(hour from (now() at time zone 'America/Sao_Paulo'))::int;
  week_start date := today - ((dow + 6) % 7);
  days_left_in_week int := 7 - ((dow + 6) % 7);
  r public.engagement_rules%rowtype;
begin
  select * into r from public.engagement_rules er where er.kind = rule_kind;
  if not found or not r.enabled then return; end if;

  if rule_kind = 'plan_expiring' then
    return query
      select e.uid,
             coalesce(nullif(btrim(e.md->>'apelido'), ''), nullif(btrim(e.md->>'nome'), ''), 'Atleta'),
             jsonb_build_object('quando', case (wp.end_date - today)
               when 0 then 'hoje' when 1 then 'amanhã'
               else 'em ' || (wp.end_date - today) || ' dias' end)
      from public.engagement_eligible(rule_kind, r.cooldown_days) e
      join public.workout_plans wp on wp.user_id = e.uid and wp.is_active
      where wp.end_date is not null and wp.end_date between today and today + 3;

  elsif rule_kind = 'first_workout' then
    return query
      select e.uid,
             coalesce(nullif(btrim(e.md->>'apelido'), ''), nullif(btrim(e.md->>'nome'), ''), 'Atleta'),
             '{}'::jsonb
      from public.engagement_eligible(rule_kind, r.cooldown_days) e
      join auth.users u on u.id = e.uid
      where (u.created_at at time zone 'America/Sao_Paulo')::date between today - 3 and today - 1
        and exists (select 1 from public.workout_plans wp where wp.user_id = e.uid and wp.is_active)
        and not exists (select 1 from public.training_days() t where t.user_id = e.uid);

  elsif rule_kind = 'weekly_goal' then
    return query
      with agg as (
        select t.user_id as uid, max(t.day) as last_day,
               count(*) filter (where t.day >= week_start) as done
        from public.training_days() t
        group by t.user_id
      ),
      goals as (
        select e.uid, e.md, a.done,
               case when e.md->>'weeklyGoal' ~ '^[0-9]{1,2}$'
                    then (case when (e.md->>'weeklyGoal')::int > 0 then (e.md->>'weeklyGoal')::int else 5 end)
                    else 5 end as goal
        from public.engagement_eligible(rule_kind, r.cooldown_days) e
        join agg a on a.uid = e.uid
        where a.last_day > today - 30
      )
      select g.uid,
             coalesce(nullif(btrim(g.md->>'apelido'), ''), nullif(btrim(g.md->>'nome'), ''), 'Atleta'),
             jsonb_build_object('faltam', g.goal - g.done, 'feitos', g.done, 'meta', g.goal)
      from goals g
      where g.goal - g.done > 0 and g.goal - g.done <= days_left_in_week;

  elsif rule_kind = 'workout_today' then
    return query
      with agg as (
        select t.user_id as uid, max(t.day) as last_day
        from public.training_days() t
        group by t.user_id
      )
      select e.uid,
             coalesce(nullif(btrim(e.md->>'apelido'), ''), nullif(btrim(e.md->>'nome'), ''), 'Atleta'),
             jsonb_build_object('foco', pd.foco)
      from public.engagement_eligible(rule_kind, r.cooldown_days) e
      join agg a on a.uid = e.uid and a.last_day >= today - 14 and a.last_day < today
      join public.workout_plans wp on wp.user_id = e.uid and wp.is_active
        and (wp.end_date is null or wp.end_date >= today)
      join public.plan_days pd on pd.plan_id = wp.id
        and lower(left(translate(pd.dia, 'ÇÁÃÀçáãà', 'CAAAcaaa'), 3))
            = (array['dom','seg','ter','qua','qui','sex','sab'])[dow + 1]
      where btrim(pd.foco) <> '' and pd.foco !~* 'descanso'
        and exists (select 1 from public.plan_exercises pe where pe.plan_day_id = pd.id and not pe.is_post_workout)
        -- horário: 1h antes do preferido do usuário; sem preferência, o da regra
        and (
          ignore_hour
          or case when e.md->>'trainingHour' ~ '^[0-9]{1,2}$'
                  then (case when (e.md->>'trainingHour')::int between 0 and 23
                             then hour_now = (((e.md->>'trainingHour')::int + 23) % 24)
                             else hour_now = r.send_hour end)
                  else hour_now = r.send_hour end
        );

  elsif rule_kind = 'comeback' then
    return query
      with agg as (
        select t.user_id as uid, max(t.day) as last_day
        from public.training_days() t
        group by t.user_id
      )
      select e.uid,
             coalesce(nullif(btrim(e.md->>'apelido'), ''), nullif(btrim(e.md->>'nome'), ''), 'Atleta'),
             jsonb_build_object('dias', today - a.last_day)
      from public.engagement_eligible(rule_kind, r.cooldown_days) e
      join agg a on a.uid = e.uid
      where a.last_day between today - 60 and today - 15;
  end if;
end;
$$;

revoke execute on function public.engagement_candidates(text, boolean) from public, anon, authenticated;
grant execute on function public.engagement_candidates(text, boolean) to service_role;

-- Prévia do painel: ignora o horário (mostra quem se encaixa no critério).
create function public.admin_engagement_preview(rule_kind text)
returns table (user_id uuid, email text, nome text, vars jsonb)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select c.user_id, u.email::text, c.nome, c.vars
    from public.engagement_candidates(rule_kind, true) c
    join auth.users u on u.id = c.user_id
    order by u.email;
end;
$$;

grant execute on function public.admin_engagement_preview(text) to authenticated;

-- ---------------------------------------------------------------------------
-- "Em risco de abandono" (painel): quem está em modo pausa não conta.
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
      and coalesce(u.raw_user_meta_data->>'pausedUntil', '') < today::text
      and (
        (a.last_day is not null and a.last_day < today - inactive_days)
        or (a.last_day is null and (u.created_at at time zone 'America/Sao_Paulo')::date < today - 7)
      )
    order by a.last_day desc nulls last, u.created_at desc
    limit max_rows;
end;
$$;

grant execute on function public.admin_at_risk_users(int, int) to authenticated;
