-- Lembrete de push no dia de correr do programa (EAFIT Run).
--
--  * run_day_planned(md, dia): o dia tem corrida no programa da conta? Espelha
--    app-react/src/modules/corrida/program.js: com o programa em andamento os
--    dias de corrida dependem do nível (iniciante seg/qua/sáb, intermediário
--    seg/qua/sex/sáb, avançado seg/ter/qui/sex/sáb; o treino cruzado e o
--    descanso não contam); sem programa em andamento (corrida livre ou fora
--    das semanas) vale a semana de manutenção, seg/qua/sáb. Quem nunca
--    escolheu programa não recebe. Dado inválido em user_metadata (a conta
--    escreve nele) nunca derruba a consulta: vira "não é dia de correr".
--  * Regra run_today: 17h, todo dia, no máximo uma vez por dia, para quem tem
--    corrida planejada hoje e ainda não correu. Liga/desliga, horário e texto
--    no painel admin como as outras. Passa pelo limite semanal de push.
--  * engagement_candidates recriada a partir da versão de produção (conferida
--    igual à da migration 20270119) com o tipo novo.

create or replace function public.run_day_planned(md jsonb, d date)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  goal text := md->>'runGoal';
  lvl text := case when md->>'runNivel' in ('iniciante', 'avancado') then md->>'runNivel' else 'intermediario' end;
  dow int := (extract(dow from d)::int + 6) % 7;
  weeks int;
  start date;
  w int := 0;
begin
  if goal is null or goal not in ('5k', '10k', 'meia', 'livre') then return false; end if;
  if goal = 'meia' and lvl = 'iniciante' then goal := '10k'; end if;
  weeks := case goal when '5k' then 8 when '10k' then 10 when 'meia' then 12 else 0 end;
  if md->>'runStart' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    start := (md->>'runStart')::date;
    start := start - ((extract(dow from start)::int + 6) % 7);
    if d - start >= 0 then w := (d - start) / 7 + 1; end if;
  end if;
  if weeks > 0 and w between 1 and weeks then
    return case lvl
      when 'avancado' then dow in (0, 1, 3, 4, 5)
      when 'intermediario' then dow in (0, 2, 4, 5)
      else dow in (0, 2, 5) end;
  end if;
  return dow in (0, 2, 5);
exception when others then
  return false;
end;
$$;

revoke execute on function public.run_day_planned(jsonb, date) from public, anon, authenticated;
grant execute on function public.run_day_planned(jsonb, date) to service_role;

insert into public.engagement_rules (kind, label, description, variables, priority, send_hour, weekdays, cooldown_days, title, body, title_en, body_en, sport)
values
  ('run_today', 'Dia de correr',
   'Todo dia, para quem tem corrida no programa de hoje (EAFIT Run) e ainda não correu.',
   '{nome}', 22, 17, null, 1,
   '🏃 Hoje é dia de correr',
   '{nome}, seu programa tem corrida hoje. Abra a aba Gravar e comece!',
   '🏃 Today is a run day',
   '{nome}, your program has a run today. Open the Record tab and start!',
   'corrida')
on conflict (kind) do nothing;

CREATE OR REPLACE FUNCTION public.engagement_candidates(rule_kind text, ignore_hour boolean DEFAULT false)
 RETURNS TABLE(user_id uuid, nome text, vars jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  week_start date := today - ((extract(dow from today)::int + 6) % 7);
  r public.engagement_rules%rowtype;
begin
  if rule_kind not in ('protein_today', 'progress_photo', 'dormant', 'run_week', 'run_first', 'run_streak', 'run_goal', 'run_comeback', 'run_today') then
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
  elsif rule_kind = 'run_today' then
    -- Dia de correr no programa da pessoa (run_day_planned espelha program.js)
    -- e ainda sem corrida hoje.
    return query
      select e.uid,
             coalesce(nullif(btrim(e.md->>'apelido'), ''), nullif(btrim(e.md->>'nome'), ''), 'Atleta'),
             '{}'::jsonb
      from public.engagement_eligible(rule_kind, r.cooldown_days) e
      where public.run_day_planned(e.md, today)
        and not exists (select 1 from public.runs ru where ru.user_id = e.uid and ru.run_date = today);
  end if;
end;
$function$;

revoke execute on function public.engagement_candidates(text, boolean) from public, anon, authenticated;
grant execute on function public.engagement_candidates(text, boolean) to service_role;
