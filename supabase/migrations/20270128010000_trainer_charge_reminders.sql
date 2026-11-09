-- Lembretes de cobranca por push.
--
-- A Edge Function send-charge-reminders roda de hora em hora (pg_cron) e
-- pergunta ao banco quem deve ser avisado (trainer_charge_candidates):
--   • aluno: cobranca vence amanha ('due_soon') e vence hoje ('due_today');
--   • personal: cobranca em aberto ha 3 dias ou mais ('late'), ate 30 dias
--     depois do vencimento (depois disso o personal ja sabe).
-- Cada aviso sai uma vez so (trainer_charge_reminder_log) e so e marcado como
-- enviado depois de entregue a pelo menos um aparelho do destinatario.
--
-- O personal liga/desliga em trainer_settings.alert_charge (padrao: ligado);
-- vale para os dois lados (se desliga, o aluno tambem nao recebe lembrete).
--
-- Nada aqui troca o contrato de funcoes antigas alem de trainer_get_settings,
-- que ganha uma coluna a mais no fim (versoes antigas do app ignoram).

alter table public.trainer_settings
  add column if not exists alert_charge boolean not null default true;

create table if not exists public.trainer_charge_reminder_log (
  charge_id uuid not null references public.trainer_charges(id) on delete cascade,
  kind text not null check (kind in ('due_soon', 'due_today', 'late')),
  recipient uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (charge_id, kind, recipient)
);

alter table public.trainer_charge_reminder_log enable row level security;

-- ---------------------------------------------------------------------------
-- Configuracoes do personal: trainer_get_settings devolve tambem s_charge.
-- ---------------------------------------------------------------------------
drop function if exists public.trainer_get_settings();

create function public.trainer_get_settings()
returns table (s_inactive boolean, s_pr boolean, s_pain boolean, s_weekly boolean, s_days int, s_charge boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_trainer() then raise exception 'not_authorized'; end if;

  return query
    select coalesce(t.alert_inactive, true), coalesce(t.alert_pr, true), coalesce(t.alert_pain, true),
           coalesce(t.weekly_summary, true), coalesce(t.inactive_days, 7), coalesce(t.alert_charge, true)
    from (select 1) x
    left join public.trainer_settings t on t.trainer_id = auth.uid();
end;
$$;

create or replace function public.trainer_set_charge_alert(p_on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_trainer() then raise exception 'not_authorized'; end if;

  insert into public.trainer_settings (trainer_id, alert_charge, updated_at)
  values (auth.uid(), coalesce(p_on, true), now())
  on conflict (trainer_id) do update
    set alert_charge = excluded.alert_charge, updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Lembretes pendentes. So service_role (a Edge Function).
--   cr_role: 'client' (lembrete de vencimento) ou 'trainer' (aluno em atraso)
--   cr_other: nome da outra ponta (personal para o aluno; aluno para o personal)
-- Datas pelo fuso de Brasilia. Vinculo precisa estar ativo.
-- ---------------------------------------------------------------------------
create or replace function public.trainer_charge_candidates()
returns table (
  cr_charge uuid, cr_kind text, cr_user uuid, cr_role text,
  cr_other text, cr_desc text, cr_cents int, cr_due date
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  return query
  with open_ch as (
    select c.id, c.trainer_id, c.client_id, c.description, c.amount_cents, c.due_date
    from public.trainer_charges c
    join public.trainer_clients l on l.trainer_id = c.trainer_id and l.client_id = c.client_id and l.status = 'active'
    join public.trainers t on t.user_id = c.trainer_id
    left join public.trainer_settings s on s.trainer_id = c.trainer_id
    where c.status = 'open'
      and coalesce(s.alert_charge, true)
      and c.due_date between today - 30 and today + 1
  ),
  names as (
    select u.id,
           coalesce(nullif(btrim(u.raw_user_meta_data->>'apelido'), ''), nullif(btrim(u.raw_user_meta_data->>'nome'), ''), split_part(u.email::text, '@', 1)) as nm
    from auth.users u
    where u.id in (select o.trainer_id from open_ch o union select o.client_id from open_ch o)
  ),
  rows_all as (
    select o.id as charge, case when o.due_date = today then 'due_today' else 'due_soon' end as kind,
           o.client_id as usr, 'client'::text as role, nt.nm as other, o.description as descr,
           o.amount_cents as cents, o.due_date as due
    from open_ch o
    join names nt on nt.id = o.trainer_id
    where o.due_date >= today
    union all
    select o.id, 'late'::text, o.trainer_id, 'trainer'::text, nc.nm, o.description, o.amount_cents, o.due_date
    from open_ch o
    join names nc on nc.id = o.client_id
    where o.due_date <= today - 3
  )
  select r.charge, r.kind, r.usr, r.role, r.other, r.descr, r.cents, r.due
  from rows_all r
  where not exists (
    select 1 from public.trainer_charge_reminder_log g
    where g.charge_id = r.charge and g.kind = r.kind and g.recipient = r.usr
  )
  order by r.usr, r.due, r.charge;
end;
$$;

revoke execute on function public.trainer_get_settings() from public, anon;
revoke execute on function public.trainer_set_charge_alert(boolean) from public, anon;
grant execute on function public.trainer_get_settings() to authenticated;
grant execute on function public.trainer_set_charge_alert(boolean) to authenticated;

revoke execute on function public.trainer_charge_candidates() from public, anon, authenticated;
grant execute on function public.trainer_charge_candidates() to service_role;

-- ---------------------------------------------------------------------------
-- Cron de hora em hora (minuto 30, para nao colidir com send-trainer-alerts).
-- Pre-requisito: publicar a Edge Function send-charge-reminders (Verify JWT
-- desligado; autenticada pelo header x-cron-secret, igual as outras). Dentro
-- da funcao so se avisa entre 8h e 20h de Brasilia.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'send-charge-reminders-hourly',
  '30 * * * *',
  $$
  select net.http_post(
    url := 'https://btzdetvoneyhzthsmdrp.supabase.co/functions/v1/send-charge-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    )
  );
  $$
);
