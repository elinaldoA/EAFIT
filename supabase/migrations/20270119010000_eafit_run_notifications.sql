-- Notificações por esporte: quem está no módulo de corrida (user_metadata.esporte
-- = 'corrida') recebe só avisos de corrida, e quem está na musculação só os de
-- musculação.
--
--  * engagement_rules.sport ('musculacao' | 'corrida'): a que esporte a regra
--    se destina. As regras que já existem são todas de musculação (padrão).
--  * engagement_eligible só devolve quem é do esporte da regra: essa é a única
--    trava que as funções de candidatos precisam, e vale para todas as regras.
--  * Regras novas de corrida, no mesmo padrão (horário, dias, texto e liga/
--    desliga no painel admin):
--      run_first    — conta de corrida criada há 2 a 14 dias, ainda sem corrida.
--      run_streak   — domingo à tarde: 3+ semanas seguidas correndo e nenhuma
--                     corrida nesta semana ainda.
--      run_goal     — quinta e sexta: faltam 1 km ou mais para a meta semanal
--                     de km (Perfil), para quem correu nos últimos 28 dias.
--      run_week     — segunda de manhã: o resumo da semana passada (já criada
--                     na migration anterior; aqui ganha o esporte e o km no
--                     idioma da pessoa pelo km_text).
--      run_comeback — a última corrida foi há 8 a 35 dias.
--  * email_run_week(): km e corridas da semana passada e da anterior, para o
--    e-mail semanal de quem corre (send-weekly-emails).
--
-- engagement_candidates é recriada a partir da versão de produção (que traz
-- 'protein_today', 'progress_photo' e 'dormant' além da base) com os tipos de
-- corrida. A elegibilidade também vem da versão de produção, com a trava nova.

alter table public.engagement_rules
  add column if not exists sport text not null default 'musculacao'
    check (sport in ('musculacao', 'corrida'));

-- Esporte da conta: só 'corrida' é outro esporte por enquanto; qualquer outro
-- valor (ou nenhum) é musculação, como o app faz (lib/sportModule.js).
create or replace function public.user_sport(md jsonb)
returns text
language sql
immutable
as $$
  select case when md->>'esporte' = 'corrida' then 'corrida' else 'musculacao' end;
$$;

-- Km com uma casa decimal no idioma da conta: vírgula em português, ponto em inglês.
create or replace function public.km_text(meters numeric, md jsonb)
returns text
language sql
immutable
as $$
  select case when md->>'lang' = 'en'
              then to_char(meters / 1000.0, 'FM990.0')
              else replace(to_char(meters / 1000.0, 'FM990.0'), '.', ',') end;
$$;

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
    -- cada regra é de um esporte: a pessoa só recebe as do esporte dela
    and public.user_sport(u.raw_user_meta_data)
        = coalesce((select er.sport from public.engagement_rules er where er.kind = rule_kind), 'musculacao')
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

insert into public.engagement_rules (kind, label, description, variables, priority, send_hour, weekdays, cooldown_days, title, body, title_en, body_en, sport)
values
  ('run_first', 'Primeira corrida',
   'Para quem escolheu o EAFIT Run há 2 a 14 dias e ainda não registrou nenhuma corrida.',
   '{nome}', 24, 10, null, 5,
   '🏃 Sua primeira corrida te espera',
   '{nome}, abra a aba Gravar e comece: o app mede o tempo e a distância pelo GPS e guarda tudo.',
   '🏃 Your first run is waiting',
   '{nome}, open the Record tab and start: the app measures time and distance by GPS and keeps it all.',
   'corrida'),
  ('run_streak', 'Sequência de semanas em risco',
   'No domingo à tarde, para quem correu nas 3 últimas semanas seguidas e ainda não correu nesta.',
   '{nome}, {semanas}', 28, 18, '{0}', 6,
   '🔥 Sua sequência de {semanas} semanas está em risco',
   '{nome}, você ainda não correu nesta semana. Uma corrida hoje mantém a sequência viva!',
   '🔥 Your {semanas}-week streak is at risk',
   '{nome}, you have not run this week yet. A run today keeps the streak alive!',
   'corrida'),
  ('run_goal', 'Meta semanal de km',
   'Quinta e sexta, para quem definiu meta de km por semana (Perfil), correu nos últimos 28 dias e ainda falta 1 km ou mais.',
   '{nome}, {feitos}, {meta}, {faltam}', 32, 18, '{4,5}', 6,
   '🎯 Faltam {faltam} km pra sua meta',
   'Você correu {feitos} de {meta} km nesta semana. Ainda dá tempo de fechar!',
   '🎯 {faltam} km to go for your goal',
   'You ran {feitos} of {meta} km this week. There is still time to close it out!',
   'corrida'),
  ('run_comeback', 'Voltar a correr',
   'Para quem já correu e a última corrida foi há 8 a 35 dias.',
   '{nome}, {dias}', 52, 11, null, 7,
   '👟 Que tal uma corridinha?',
   '{nome}, faz {dias} dias da sua última corrida. Um trote leve já recomeça tudo!',
   '👟 How about a little run?',
   '{nome}, it has been {dias} days since your last run. An easy jog gets things going again!',
   'corrida')
on conflict (kind) do nothing;

update public.engagement_rules set sport = 'corrida' where kind = 'run_week';

create or replace function public.engagement_candidates(rule_kind text, ignore_hour boolean default false)
returns table (user_id uuid, nome text, vars jsonb)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  week_start date := today - ((extract(dow from today)::int + 6) % 7);
  r public.engagement_rules%rowtype;
begin
  if rule_kind not in ('protein_today', 'progress_photo', 'dormant', 'run_week', 'run_first', 'run_streak', 'run_goal', 'run_comeback') then
    return query select * from public.engagement_candidates_base(rule_kind, ignore_hour);
    return;
  end if;

  select * into r from public.engagement_rules er where er.kind = rule_kind;
  if not found or not r.enabled then return; end if;

  if rule_kind = 'protein_today' then
    return query
      select e.uid,
             coalesce(nullif(btrim(e.md->>'apelido'), ''), nullif(btrim(e.md->>'nome'), ''), 'Atleta'),
             '{}'::jsonb
      from public.engagement_eligible(rule_kind, r.cooldown_days) e
      where (select count(*) from public.protein_logs pl
             where pl.user_id = e.uid and pl.amount_g > 0
               and pl.log_date between today - 7 and today - 1) >= 3
        and not exists (select 1 from public.protein_logs pl
                        where pl.user_id = e.uid and pl.log_date = today and pl.amount_g > 0);

  elsif rule_kind = 'progress_photo' then
    return query
      with last_photo as (
        select pp.user_id as uid, max(pp.photo_date) as last_day
        from public.progress_photos pp
        group by pp.user_id
      )
      select e.uid,
             coalesce(nullif(btrim(e.md->>'apelido'), ''), nullif(btrim(e.md->>'nome'), ''), 'Atleta'),
             jsonb_build_object('dias', today - lp.last_day)
      from public.engagement_eligible(rule_kind, r.cooldown_days) e
      join last_photo lp on lp.uid = e.uid
      where lp.last_day between today - 120 and today - 28;

  elsif rule_kind = 'dormant' then
    -- Mesma regra da tela Sumidos (admin_dormant_candidates com 7 dias), só
    -- até 60 dias sumido: depois disso o push não chega mais a quase ninguém.
    return query
      select d.user_id,
             coalesce(nullif(btrim(e.md->>'apelido'), ''), nullif(btrim(e.md->>'nome'), ''), 'Atleta'),
             jsonb_build_object('dias', d.days_away)
      from public.engagement_eligible(rule_kind, r.cooldown_days) e
      join public.dormant_users(7) d on d.user_id = e.uid
      where d.days_away <= 60;

  elsif rule_kind = 'run_week' then
    -- Corridas privadas contam: o resumo é só da própria pessoa.
    return query
      with week as (
        select ru.user_id as uid, sum(ru.distance_m) as meters, count(*) as total
        from public.runs ru
        where ru.run_date between week_start - 7 and week_start - 1
        group by ru.user_id
        having sum(ru.distance_m) >= 1000
      )
      select e.uid,
             coalesce(nullif(btrim(e.md->>'apelido'), ''), nullif(btrim(e.md->>'nome'), ''), 'Atleta'),
             jsonb_build_object('km', public.km_text(w.meters, e.md), 'corridas', w.total)
      from public.engagement_eligible(rule_kind, r.cooldown_days) e
      join week w on w.uid = e.uid;

  elsif rule_kind = 'run_first' then
    return query
      select e.uid,
             coalesce(nullif(btrim(e.md->>'apelido'), ''), nullif(btrim(e.md->>'nome'), ''), 'Atleta'),
             '{}'::jsonb
      from public.engagement_eligible(rule_kind, r.cooldown_days) e
      join auth.users u on u.id = e.uid
      where (u.created_at at time zone 'America/Sao_Paulo')::date between today - 14 and today - 2
        and not exists (select 1 from public.runs ru where ru.user_id = e.uid);

  elsif rule_kind = 'run_streak' then
    -- Semanas seguidas com corrida até a semana passada (semana = segunda a
    -- domingo, contada em número de semanas desde uma segunda qualquer).
    return query
      with weeks as (
        select ru.user_id as uid, ((ru.run_date - date '2000-01-03') / 7) as wk
        from public.runs ru
        where ru.run_date < week_start
        group by 1, 2
      ),
      islands as (
        select w.uid, w.wk, w.wk - row_number() over (partition by w.uid order by w.wk) as grp
        from weeks w
      ),
      streaks as (
        select i.uid, count(*) as n, max(i.wk) as last_wk
        from islands i
        group by i.uid, i.grp
      )
      select e.uid,
             coalesce(nullif(btrim(e.md->>'apelido'), ''), nullif(btrim(e.md->>'nome'), ''), 'Atleta'),
             jsonb_build_object('semanas', s.n)
      from public.engagement_eligible(rule_kind, r.cooldown_days) e
      join streaks s on s.uid = e.uid
      where s.last_wk = ((week_start - 7) - date '2000-01-03') / 7
        and s.n >= 3
        and not exists (select 1 from public.runs ru where ru.user_id = e.uid and ru.run_date >= week_start);

  elsif rule_kind = 'run_goal' then
    -- A meta vem do perfil (user_metadata.runWeeklyKm, livre para o usuário
    -- escrever): só vale se for um número, senão a conversão quebraria a consulta.
    return query
      with goals as (
        select e.uid, e.md,
               case when e.md->>'runWeeklyKm' ~ '^[0-9]{1,3}(\.[0-9]+)?$'
                    then (e.md->>'runWeeklyKm')::numeric end as goal_km
        from public.engagement_eligible(rule_kind, r.cooldown_days) e
      ),
      week as (
        select ru.user_id as uid, sum(ru.distance_m) as meters
        from public.runs ru
        where ru.run_date between week_start and today
        group by ru.user_id
      )
      select g.uid,
             coalesce(nullif(btrim(g.md->>'apelido'), ''), nullif(btrim(g.md->>'nome'), ''), 'Atleta'),
             jsonb_build_object(
               'feitos', public.km_text(coalesce(w.meters, 0), g.md),
               'meta', public.km_text(g.goal_km * 1000, g.md),
               'faltam', public.km_text(g.goal_km * 1000 - coalesce(w.meters, 0), g.md))
      from goals g
      left join week w on w.uid = g.uid
      where g.goal_km between 1 and 300
        and g.goal_km * 1000 - coalesce(w.meters, 0) >= 1000
        and exists (select 1 from public.runs ru where ru.user_id = g.uid and ru.run_date >= today - 28);

  elsif rule_kind = 'run_comeback' then
    return query
      with last_run as (
        select ru.user_id as uid, max(ru.run_date) as last_day
        from public.runs ru
        group by ru.user_id
      )
      select e.uid,
             coalesce(nullif(btrim(e.md->>'apelido'), ''), nullif(btrim(e.md->>'nome'), ''), 'Atleta'),
             jsonb_build_object('dias', today - lr.last_day)
      from public.engagement_eligible(rule_kind, r.cooldown_days) e
      join last_run lr on lr.uid = e.uid
      where today - lr.last_day between 8 and 35;
  end if;
end;
$$;

revoke execute on function public.engagement_candidates(text, boolean) from public, anon, authenticated;
grant execute on function public.engagement_candidates(text, boolean) to service_role;

-- E-mail semanal de quem corre (send-weekly-emails): km e corridas da semana
-- passada (segunda a domingo) e km da semana anterior, só de quem correu 1 km
-- ou mais na semana passada. Corridas privadas contam: o e-mail é só da pessoa.
create or replace function public.email_run_week()
returns table (rw_user uuid, rw_meters bigint, rw_runs bigint, rw_prev_meters bigint)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select ((now() at time zone 'America/Sao_Paulo')::date
            - ((extract(dow from (now() at time zone 'America/Sao_Paulo')::date)::int + 6) % 7)) as monday
  )
  select r.user_id,
         coalesce(sum(r.distance_m) filter (where r.run_date >= b.monday - 7), 0)::bigint,
         (count(*) filter (where r.run_date >= b.monday - 7))::bigint,
         coalesce(sum(r.distance_m) filter (where r.run_date < b.monday - 7), 0)::bigint
  from public.runs r, bounds b
  where r.run_date >= b.monday - 14 and r.run_date < b.monday
  group by r.user_id
  having coalesce(sum(r.distance_m) filter (where r.run_date >= b.monday - 7), 0) >= 1000;
$$;

revoke execute on function public.email_run_week() from public, anon, authenticated;
grant execute on function public.email_run_week() to service_role;
