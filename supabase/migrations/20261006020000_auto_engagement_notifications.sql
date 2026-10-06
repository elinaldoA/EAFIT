-- Notificações automáticas de engajamento (push) para estimular o uso do app.
--
-- Como funciona:
--  * engagement_rules: uma linha por tipo de notificação, editável pelo admin
--    (liga/desliga, horário, dias da semana, intervalo mínimo, texto).
--  * engagement_candidates(kind): decide QUEM recebe cada tipo agora. Concentra
--    todas as travas — admin/banido, opt-out do usuário (user_metadata
--    notifyEngagement = false), precisa ter push ativo, intervalo mínimo por
--    tipo e no máximo 1 notificação de engajamento por usuário por dia.
--  * notification_log: registro de cada envio (alimenta as travas acima e as
--    métricas do painel).
--  * A Edge Function send-engagement roda de hora em hora (pg_cron), pega as
--    regras do horário atual, chama engagement_candidates e dispara o push.
--
-- Convenções: "treinou" = public.training_days(); datas em America/Sao_Paulo;
-- dias da semana 0=domingo..6=sábado. Em funções com RETURNS TABLE as colunas
-- de saída viram variáveis plpgsql, então toda coluna de tabela é qualificada.

-- ---------------------------------------------------------------------------
-- Regras
-- ---------------------------------------------------------------------------
create table if not exists public.engagement_rules (
  kind text primary key,
  label text not null,
  description text not null default '',
  variables text not null default '',
  enabled boolean not null default true,
  priority smallint not null default 50,
  send_hour smallint not null check (send_hour between 0 and 23),
  weekdays smallint[],
  cooldown_days smallint not null default 3 check (cooldown_days between 1 and 90),
  title text not null,
  body text not null,
  updated_at timestamptz not null default now()
);

alter table public.engagement_rules enable row level security;

drop policy if exists "admin full access" on public.engagement_rules;
create policy "admin full access" on public.engagement_rules
  for all using (public.is_admin()) with check (public.is_admin());

insert into public.engagement_rules (kind, label, description, variables, priority, send_hour, weekdays, cooldown_days, title, body)
values
  ('plan_expiring', 'Plano vencendo',
   'Avisa quando o plano ativo vence em até 3 dias, pra renovar ou progredir de ciclo.',
   '{nome}, {quando}', 10, 9, null, 3,
   '📅 Seu plano vence {quando}',
   '{nome}, aproveite os últimos treinos do ciclo e veja sua evolução.'),
  ('first_workout', 'Primeiro treino',
   'Para quem se cadastrou há 1 a 3 dias, tem plano e ainda não treinou nenhuma vez.',
   '{nome}', 20, 10, null, 3,
   '🚀 Seu primeiro treino te espera',
   '{nome}, seu plano já está pronto. Comece hoje — leva poucos minutos!'),
  ('weekly_goal', 'Meta semanal',
   'Quinta e sexta, para quem treinou nos últimos 30 dias e ainda pode fechar a meta da semana.',
   '{nome}, {faltam}, {feitos}, {meta}', 30, 18, '{4,5}', 6,
   '🎯 Faltam {faltam} treino(s) pra sua meta',
   'Você fez {feitos} de {meta} nesta semana. Ainda dá tempo de fechar!'),
  ('workout_today', 'Treino do dia',
   'Lembra do treino planejado para hoje, para quem vinha treinando (últimos 14 dias) e ainda não treinou hoje.',
   '{nome}, {foco}', 40, 17, null, 1,
   '💪 Hoje é dia de {foco}',
   '{nome}, seu treino está esperando. Bora?'),
  ('comeback', 'Volta após pausa longa',
   'Para quem parou de treinar entre 15 e 60 dias; no máximo uma vez por semana.',
   '{nome}, {dias}', 50, 11, null, 7,
   '👋 Sua evolução está te esperando',
   '{nome}, faz {dias} dias desde o último treino. Retome hoje com um treino leve.')
on conflict (kind) do nothing;

-- ---------------------------------------------------------------------------
-- Log de envios
-- ---------------------------------------------------------------------------
create table if not exists public.notification_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists notification_log_user_idx on public.notification_log (user_id, created_at desc);
create index if not exists notification_log_kind_idx on public.notification_log (kind, created_at desc);

alter table public.notification_log enable row level security;

drop policy if exists "admin read" on public.notification_log;
create policy "admin read" on public.notification_log
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Elegibilidade comum: quem pode receber um push de engajamento deste tipo.
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
-- Candidatos de um tipo agora. vars = valores dos placeholders do template.
-- ---------------------------------------------------------------------------
create or replace function public.engagement_candidates(rule_kind text)
returns table (user_id uuid, nome text, vars jsonb)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  dow int := extract(dow from (now() at time zone 'America/Sao_Paulo'))::int;
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
               case when e.md->>'weeklyGoal' ~ '^[0-9]{1,2}$' and (e.md->>'weeklyGoal')::int > 0
                    then (e.md->>'weeklyGoal')::int else 5 end as goal
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
        and exists (select 1 from public.plan_exercises pe where pe.plan_day_id = pd.id and not pe.is_post_workout);

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

revoke execute on function public.engagement_candidates(text) from public, anon, authenticated;
grant execute on function public.engagement_candidates(text) to service_role;

-- ---------------------------------------------------------------------------
-- Cron de hora em hora (minuto 0). O horário de Brasília é UTC-3 (sem horário
-- de verão), então "no minuto 0 UTC" cai no minuto 0 de Brasília também.
-- Pré-requisito: implantar a Edge Function send-engagement (Verify JWT
-- desligado; autenticada pelo header x-cron-secret, igual às outras).
-- ---------------------------------------------------------------------------
select cron.schedule(
  'send-engagement-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://btzdetvoneyhzthsmdrp.supabase.co/functions/v1/send-engagement',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    )
  );
  $$
);
