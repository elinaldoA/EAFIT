-- Mensagens automáticas de ativação: empurram o aluno novo a dar o primeiro
-- treino e a criar o hábito de usar o app. Somam-se às regras de 20261006020000
-- (first_workout cobre quem se cadastrou há 1-3 dias COM plano).
--
--  * no_plan             — cadastrou há 1-7 dias, ainda sem plano ativo nem treino.
--  * first_workout_late  — cadastrou há 4-14 dias, tem plano e nunca treinou
--                          (continuação suave do first_workout, sem sobrepor a janela).
--  * second_workout      — fez só 1 treino, há 2-6 dias: transforma o 1º em hábito.
--  * invite_friends      — já treinou 3+ vezes, treinou nos últimos 14 dias e
--                          não tem nenhum amigo: apresenta amigos/ranking semanal.
--
-- As travas (opt-out, pausa, push ativo, cooldown por tipo, 1 por dia) continuam
-- todas em engagement_eligible. A ordem de prioridade decide qual vence no dia.
-- Edição de textos e horários: painel admin (engagement_rules).

insert into public.engagement_rules (kind, label, description, variables, priority, send_hour, weekdays, cooldown_days, title, body)
values
  ('no_plan', 'Sem plano ainda',
   'Para quem se cadastrou há 1 a 7 dias, ainda não tem plano ativo e nunca treinou.',
   '{nome}', 18, 10, null, 4,
   '🏋️ Vamos montar seu primeiro treino?',
   '{nome}, você ainda não tem um plano. Monte o seu no app (ou peça ao seu treinador) e comece hoje!'),
  ('first_workout_late', 'Primeiro treino (lembrete)',
   'Para quem se cadastrou há 4 a 14 dias, tem plano e ainda não treinou nenhuma vez.',
   '{nome}', 22, 10, null, 5,
   '⏳ Seu primeiro treino ainda está te esperando',
   '{nome}, não precisa ser perfeito: um treino curto já conta e começa sua sequência. Abra o app e dê o primeiro passo!'),
  ('second_workout', 'Segundo treino',
   'Para quem fez só um treino, há 2 a 6 dias. Ajuda a transformar o primeiro treino em hábito.',
   '{nome}, {dias}', 25, 18, null, 4,
   '🔥 Bora emendar o segundo treino?',
   '{nome}, seu primeiro treino foi há {dias} dias. Treinar de novo agora é o que faz a sequência pegar!'),
  ('invite_friends', 'Convidar amigos',
   'Para quem já treinou 3+ vezes, treinou nos últimos 14 dias e ainda não tem amigos no app.',
   '{nome}', 60, 19, '{0,1,2,3}', 14,
   '👥 Treinar com amigos é mais fácil',
   '{nome}, adicione um amigo pelo código e acompanhem juntos o ranking semanal e o feed de treinos.')
on conflict (kind) do nothing;

create or replace function public.engagement_candidates(rule_kind text, ignore_hour boolean default false)
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

  elsif rule_kind = 'first_workout_late' then
    return query
      select e.uid,
             coalesce(nullif(btrim(e.md->>'apelido'), ''), nullif(btrim(e.md->>'nome'), ''), 'Atleta'),
             '{}'::jsonb
      from public.engagement_eligible(rule_kind, r.cooldown_days) e
      join auth.users u on u.id = e.uid
      where (u.created_at at time zone 'America/Sao_Paulo')::date between today - 14 and today - 4
        and exists (select 1 from public.workout_plans wp where wp.user_id = e.uid and wp.is_active)
        and not exists (select 1 from public.training_days() t where t.user_id = e.uid);

  elsif rule_kind = 'no_plan' then
    return query
      select e.uid,
             coalesce(nullif(btrim(e.md->>'apelido'), ''), nullif(btrim(e.md->>'nome'), ''), 'Atleta'),
             '{}'::jsonb
      from public.engagement_eligible(rule_kind, r.cooldown_days) e
      join auth.users u on u.id = e.uid
      where (u.created_at at time zone 'America/Sao_Paulo')::date between today - 7 and today - 1
        and not exists (select 1 from public.workout_plans wp where wp.user_id = e.uid and wp.is_active)
        and not exists (select 1 from public.training_days() t where t.user_id = e.uid);

  elsif rule_kind = 'second_workout' then
    return query
      with agg as (
        select t.user_id as uid, max(t.day) as last_day, count(*) as total
        from public.training_days() t
        group by t.user_id
      )
      select e.uid,
             coalesce(nullif(btrim(e.md->>'apelido'), ''), nullif(btrim(e.md->>'nome'), ''), 'Atleta'),
             jsonb_build_object('dias', today - a.last_day)
      from public.engagement_eligible(rule_kind, r.cooldown_days) e
      join agg a on a.uid = e.uid
      where a.total = 1 and a.last_day between today - 6 and today - 2;

  elsif rule_kind = 'invite_friends' then
    return query
      with agg as (
        select t.user_id as uid, max(t.day) as last_day, count(*) as total
        from public.training_days() t
        group by t.user_id
      )
      select e.uid,
             coalesce(nullif(btrim(e.md->>'apelido'), ''), nullif(btrim(e.md->>'nome'), ''), 'Atleta'),
             '{}'::jsonb
      from public.engagement_eligible(rule_kind, r.cooldown_days) e
      join agg a on a.uid = e.uid
      where a.total >= 3 and a.last_day >= today - 14
        and not exists (
          select 1 from public.friendships f
          where f.status = 'accepted' and (f.requester_id = e.uid or f.addressee_id = e.uid)
        );

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
