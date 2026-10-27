-- Lembretes automáticos para as funções novas do app (Nutrição e fotos de
-- progresso), no mesmo padrão de engagement_rules:
--
--  * protein_today — usa o registro de proteína (3+ dos últimos 7 dias) mas
--                    ainda não registrou nada hoje: aviso no fim da tarde.
--  * progress_photo — já tem foto de progresso e a última tem de 28 a 120 dias:
--                    convida a tirar outra e comparar o antes e depois.
--
-- As travas (opt-out, pausa, push ativo, cooldown por tipo, 1 por dia) ficam em
-- engagement_eligible. Para não copiar a engagement_candidates inteira, a atual
-- vira engagement_candidates_base e a nova só trata os tipos desta migration,
-- delegando o resto. Textos e horários: painel admin (engagement_rules).

insert into public.engagement_rules (kind, label, description, variables, priority, send_hour, weekdays, cooldown_days, title, body, title_en, body_en)
values
  ('protein_today', 'Registrar proteína',
   'Para quem registrou proteína em 3+ dos últimos 7 dias e ainda não registrou nada hoje.',
   '{nome}', 70, 19, null, 2,
   '🥩 Já registrou sua proteína hoje?',
   '{nome}, falta anotar a proteína de hoje. Leva um minuto e mantém seu gráfico em dia!',
   '🥩 Logged your protein today?',
   '{nome}, today''s protein is still missing. It takes a minute and keeps your chart up to date!'),
  ('progress_photo', 'Nova foto de progresso',
   'Para quem tem foto de progresso e a última tem de 28 a 120 dias. Convida a comparar o antes e depois.',
   '{nome}, {dias}', 80, 10, '{6}', 30,
   '📸 Hora de uma nova foto de progresso',
   '{nome}, sua última foto foi há {dias} dias. Tire outra e compare o antes e depois!',
   '📸 Time for a new progress photo',
   '{nome}, your last photo was {dias} days ago. Take a new one and compare before and after!')
on conflict (kind) do nothing;

alter function public.engagement_candidates(text, boolean) rename to engagement_candidates_base;
revoke execute on function public.engagement_candidates_base(text, boolean) from public, anon, authenticated;
grant execute on function public.engagement_candidates_base(text, boolean) to service_role;

create function public.engagement_candidates(rule_kind text, ignore_hour boolean default false)
returns table (user_id uuid, nome text, vars jsonb)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  r public.engagement_rules%rowtype;
begin
  if rule_kind not in ('protein_today', 'progress_photo') then
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
  end if;
end;
$$;

revoke execute on function public.engagement_candidates(text, boolean) from public, anon, authenticated;
grant execute on function public.engagement_candidates(text, boolean) to service_role;
