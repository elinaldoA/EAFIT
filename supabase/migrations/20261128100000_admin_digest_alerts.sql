-- Relatório semanal e alertas para a equipe (Sistema → Relatórios e alertas).
-- A Edge Function send-admin-digest roda de hora em hora: confere os alertas
-- e, às segundas às 8h (Brasília), manda o relatório da semana. Cada admin
-- escolhe o que recebe (admin_notify_prefs; sem linha = recebe os dois).

create table if not exists public.admin_notify_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weekly_digest boolean not null default true,
  alerts boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.admin_notify_prefs enable row level security;
drop policy if exists "admin own notify prefs" on public.admin_notify_prefs;
create policy "admin own notify prefs" on public.admin_notify_prefs for all
  using (public.is_admin() and user_id = auth.uid()) with check (public.is_admin() and user_id = auth.uid());
revoke all on public.admin_notify_prefs from anon;

-- Regras de alerta. threshold: o valor que dispara (ver ops_alert_check).
create table if not exists public.admin_alert_rules (
  key text primary key check (key in ('erros_hora', 'cadastros_queda', 'jobs_falhando', 'suporte_atrasado')),
  enabled boolean not null default true,
  threshold numeric not null check (threshold >= 0),
  cooldown_hours int not null default 6 check (cooldown_hours between 1 and 168),
  last_fired_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.admin_alert_rules (key, threshold, cooldown_hours) values
  ('erros_hora', 20, 6),
  ('cadastros_queda', 40, 24),
  ('jobs_falhando', 1, 6),
  ('suporte_atrasado', 5, 24)
on conflict (key) do nothing;

alter table public.admin_alert_rules enable row level security;
drop policy if exists "admin reads alert rules" on public.admin_alert_rules;
create policy "admin reads alert rules" on public.admin_alert_rules for select using (public.is_admin());
drop policy if exists "admin updates alert rules" on public.admin_alert_rules;
create policy "admin updates alert rules" on public.admin_alert_rules for update
  using (public.admin_can('settings')) with check (public.admin_can('settings'));
revoke all on public.admin_alert_rules from anon;

create table if not exists public.admin_alert_log (
  id bigint generated always as identity primary key,
  key text not null,
  value numeric,
  threshold numeric,
  detail text,
  notified int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists admin_alert_log_created_idx on public.admin_alert_log (created_at desc);

alter table public.admin_alert_log enable row level security;
drop policy if exists "admin reads alert log" on public.admin_alert_log;
create policy "admin reads alert log" on public.admin_alert_log for select using (public.is_admin());
revoke all on public.admin_alert_log from anon;

-- Números do relatório (semana = últimos 7 dias contra os 7 anteriores, sem
-- admins). Só a Edge Function (service role) e o admin pela prévia chamam.
create or replace function public.ops_digest_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  out jsonb;
begin
  with nonadmin as (
    select u.id, u.created_at from auth.users u
    left join public.profiles p on p.id = u.id
    where not coalesce(p.is_admin, false)
  ),
  td as (
    select t.user_id, t.day from public.training_days() t
    where t.day > today - 14 and t.user_id in (select id from nonadmin)
  ),
  err as (
    select e.message, e.created_at from public.client_errors e
    where e.created_at >= now() - interval '14 days' and e.user_id in (select id from nonadmin)
  ),
  new_err as (
    select left(e.message, 120) as message, count(*) as n
    from err e
    where e.created_at >= now() - interval '7 days'
      and not exists (select 1 from public.client_errors o
                       where o.message = e.message and o.created_at < now() - interval '7 days')
    group by left(e.message, 120)
    order by count(*) desc
    limit 5
  ),
  partners as (
    select a.name, a.kind, count(*) as n
    from public.ambassador_referrals r
    join public.ambassadors a on a.id = r.ambassador_id
    where r.linked_at >= now() - interval '7 days'
    group by a.name, a.kind
    order by count(*) desc
    limit 3
  )
  select jsonb_build_object(
    'signups', (select count(*) from nonadmin where created_at >= now() - interval '7 days'),
    'signups_prev', (select count(*) from nonadmin where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days'),
    'trained', (select count(distinct user_id) from td where day > today - 7),
    'trained_prev', (select count(distinct user_id) from td where day <= today - 7),
    'workouts', (select count(*) from td where day > today - 7),
    'workouts_prev', (select count(*) from td where day <= today - 7),
    'errors', (select count(*) from err where created_at >= now() - interval '7 days'),
    'errors_prev', (select count(*) from err where created_at < now() - interval '7 days'),
    'new_errors', coalesce((select jsonb_agg(jsonb_build_object('message', message, 'n', n)) from new_err), '[]'::jsonb),
    'support_open', (select count(*) from public.support_queue_rows('abertos', 1000)),
    'support_late', (select count(*) from public.support_queue_rows('abertos', 1000) q where q.sq_created_at < now() - interval '48 hours'),
    'nps', (select case when count(*) = 0 then null else
                 round(100.0 * count(*) filter (where a.score >= 9) / count(*)) - round(100.0 * count(*) filter (where a.score <= 6) / count(*)) end
            from public.survey_answers a where a.score is not null and a.created_at >= now() - interval '7 days'),
    'nps_answers', (select count(*) from public.survey_answers a where a.score is not null and a.created_at >= now() - interval '7 days'),
    'risk_high', (select count(*) from public.churn_risk_rows(1000) r where r.cr_score >= 50),
    'partners', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'kind', kind, 'n', n)) from partners), '[]'::jsonb)
  ) into out;
  return out;
end;
$$;

revoke execute on function public.ops_digest_metrics() from public, anon, authenticated;
grant execute on function public.ops_digest_metrics() to service_role;

-- Prévia no painel (mesmos números do e-mail).
create or replace function public.admin_digest_preview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  return public.ops_digest_metrics();
end;
$$;

revoke execute on function public.admin_digest_preview() from public, anon;
grant execute on function public.admin_digest_preview() to authenticated;

-- Valor atual de cada regra e se passou do limite:
--   erros_hora        erros do app na última hora > limite
--   cadastros_queda   queda % dos cadastros (7 dias contra os 7 anteriores) > limite
--                     (só com 10+ cadastros na semana anterior, para não alarmar à toa)
--   jobs_falhando     falhas de jobs agendados + respostas 5xx das funções na última hora >= limite
--   suporte_atrasado  itens abertos há mais de 48 h > limite
create or replace function public.ops_alert_check()
returns table (ac_key text, ac_enabled boolean, ac_value numeric, ac_threshold numeric, ac_over boolean, ac_due boolean, ac_detail text)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_err numeric;
  v_new numeric;
  v_prev numeric;
  v_drop numeric;
  v_jobs numeric := 0;
  v_http numeric := 0;
  v_late numeric;
begin
  select count(*) into v_err from public.client_errors where created_at >= now() - interval '1 hour';
  select count(*) filter (where u.created_at >= now() - interval '7 days'),
         count(*) filter (where u.created_at >= now() - interval '14 days' and u.created_at < now() - interval '7 days')
    into v_new, v_prev
  from auth.users u left join public.profiles p on p.id = u.id where not coalesce(p.is_admin, false);
  v_drop := case when v_prev >= 10 then round(100 * (v_prev - v_new) / v_prev) else 0 end;
  begin
    select count(*) into v_jobs from cron.job_run_details where status = 'failed' and start_time >= now() - interval '1 hour';
  exception when others then v_jobs := 0;
  end;
  begin
    select count(*) into v_http from net._http_response where status_code >= 500 and created >= now() - interval '1 hour';
  exception when others then v_http := 0;
  end;
  select count(*) into v_late from public.support_queue_rows('abertos', 1000) q where q.sq_created_at < now() - interval '48 hours';

  return query
    with vals(key, value, detail, inclusive) as (
      values ('erros_hora', v_err, v_err || ' erro(s) do app na última hora', false),
             ('cadastros_queda', v_drop, v_new || ' cadastro(s) nos últimos 7 dias contra ' || v_prev || ' nos 7 anteriores', false),
             ('jobs_falhando', v_jobs + v_http, v_jobs || ' job(s) com falha e ' || v_http || ' resposta(s) 5xx das funções na última hora', true),
             ('suporte_atrasado', v_late, v_late || ' item(ns) de suporte aberto(s) há mais de 48 h', false)
    )
    select r.key, r.enabled, v.value, r.threshold,
           case when v.inclusive then v.value >= r.threshold and v.value > 0 else v.value > r.threshold end,
           r.last_fired_at is null or r.last_fired_at < now() - make_interval(hours => r.cooldown_hours),
           v.detail
    from public.admin_alert_rules r join vals v on v.key = r.key;
end;
$$;

revoke execute on function public.ops_alert_check() from public, anon, authenticated;
grant execute on function public.ops_alert_check() to service_role;

create or replace function public.admin_alert_status()
returns table (ac_key text, ac_enabled boolean, ac_value numeric, ac_threshold numeric, ac_over boolean, ac_due boolean, ac_detail text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  return query select * from public.ops_alert_check();
end;
$$;

revoke execute on function public.admin_alert_status() from public, anon;
grant execute on function public.admin_alert_status() to authenticated;

-- Destinatários (e-mail) de cada tipo: admins com a opção ligada (padrão: sim).
create or replace function public.ops_admin_recipients(p_kind text)
returns table (user_id uuid, email text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id, u.email::text
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.admin_notify_prefs np on np.user_id = p.id
  where p.is_admin and u.email is not null
    and case p_kind when 'digest' then coalesce(np.weekly_digest, true) when 'alerts' then coalesce(np.alerts, true) else false end;
$$;

revoke execute on function public.ops_admin_recipients(text) from public, anon, authenticated;
grant execute on function public.ops_admin_recipients(text) to service_role;

-- Toda hora, no minuto 5 (o relatório sai na execução das 11h UTC de segunda = 8h em Brasília).
-- Pra desligar: select cron.unschedule('send-admin-digest-hourly');
select cron.schedule(
  'send-admin-digest-hourly',
  '5 * * * *',
  $$
  select net.http_post(
    url := 'https://btzdetvoneyhzthsmdrp.supabase.co/functions/v1/send-admin-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    )
  );
  $$
);
