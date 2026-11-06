-- EAFIT Run: resumo da semana de corrida por notificação push.
--
-- Nova regra de engajamento (engagement_rules, painel admin → Notificações):
--  * run_week — toda segunda de manhã, para quem correu na semana passada
--               (segunda a domingo) e somou pelo menos 1 km: "você correu X km
--               em N corrida(s)". Toca e abre a aba Início do EAFIT Run.
--
-- As travas (opt-out de engajamento, modo pausa, push ativo, intervalo por
-- tipo, 1 por dia, limite semanal) ficam em engagement_eligible e no
-- send-engagement. Só entra quem tem corrida registrada, então hoje só chega a
-- quem está no módulo de corrida. Horário, dias e textos se editam no painel.
--
-- engagement_candidates é recriada a partir da versão de produção (que tem
-- 'protein_today', 'progress_photo' e 'dormant' além da base) com mais um tipo.
-- O km já sai formatado no idioma da pessoa (vírgula em português, ponto em inglês).

insert into public.engagement_rules (kind, label, description, variables, priority, send_hour, weekdays, cooldown_days, title, body, title_en, body_en)
values
  ('run_week', 'Resumo da semana de corrida',
   'Na segunda, para quem correu na semana passada (segunda a domingo) e somou pelo menos 1 km: quantos km e corridas.',
   '{nome}, {km}, {corridas}', 55, 9, '{1}', 6,
   '🏃 Sua semana de corrida',
   '{nome}, na semana passada você correu {km} km em {corridas} corrida(s). Veja o resumo e bora para mais uma semana!',
   '🏃 Your running week',
   '{nome}, last week you ran {km} km in {corridas} run(s). Check your summary and let''s go for another week!')
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
  week_start date := today - ((extract(dow from today)::int + 6) % 7);
  r public.engagement_rules%rowtype;
begin
  if rule_kind not in ('protein_today', 'progress_photo', 'dormant', 'run_week') then
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
             jsonb_build_object(
               'km', case when e.md->>'lang' = 'en'
                          then to_char(w.meters / 1000.0, 'FM990.0')
                          else replace(to_char(w.meters / 1000.0, 'FM990.0'), '.', ',') end,
               'corridas', w.total)
      from public.engagement_eligible(rule_kind, r.cooldown_days) e
      join week w on w.uid = e.uid;
  end if;
end;
$$;

revoke execute on function public.engagement_candidates(text, boolean) from public, anon, authenticated;
grant execute on function public.engagement_candidates(text, boolean) to service_role;
