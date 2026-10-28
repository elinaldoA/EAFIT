-- Limpeza manual (Sistema → Saúde → Limpeza de dados antigos): inclui as
-- tabelas anônimas e de envio que ficaram de fora e as criadas em 20261214.
-- Mesma regra de 20261029010000_admin_followups.sql: mínimo de 30 dias,
-- só dados técnicos, registro na auditoria.
--   landing_events   cliques e seções alcançadas na landing
--   site_pageviews   acessos às páginas do site
--   site_engagement  tempo e rolagem nas páginas do site
--   email_log        registro dos e-mails enviados
-- (app_access_log e app_sessions têm limpeza automática própria, de 180 dias.)

create or replace function public.admin_purge_stats(p_days int default 180)
returns table (pg_kind text, pg_total bigint, pg_old bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  n int := greatest(coalesce(p_days, 180), 30);
  cut_date date := (now() at time zone 'America/Sao_Paulo')::date - n;
  cut_ts timestamptz := now() - make_interval(days => n);
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select 'page_visits'::text, count(*)::bigint, (count(*) filter (where v.visited_on < cut_date))::bigint from public.page_visits v
    union all
    select 'landing_events'::text, count(*)::bigint, (count(*) filter (where e.visited_on < cut_date))::bigint from public.landing_events e
    union all
    select 'site_pageviews'::text, count(*)::bigint, (count(*) filter (where e.visited_on < cut_date))::bigint from public.site_pageviews e
    union all
    select 'site_engagement'::text, count(*)::bigint, (count(*) filter (where e.visited_on < cut_date))::bigint from public.site_engagement e
    union all
    select 'auth_events'::text, count(*)::bigint, (count(*) filter (where e.visited_on < cut_date))::bigint from public.auth_events e
    union all
    select 'user_events'::text, count(*)::bigint, (count(*) filter (where e.day < cut_date))::bigint from public.user_events e
    union all
    select 'email_log'::text, count(*)::bigint, (count(*) filter (where e.sent_on < cut_date))::bigint from public.email_log e
    union all
    select 'notification_log'::text, count(*)::bigint, (count(*) filter (where l.created_at < cut_ts))::bigint from public.notification_log l
    union all
    select 'client_errors'::text, count(*)::bigint, (count(*) filter (where c.created_at < cut_ts))::bigint from public.client_errors c;
end;
$$;

create or replace function public.admin_purge_old(p_kind text, p_days int default 180)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := greatest(coalesce(p_days, 180), 30);
  cut_date date := (now() at time zone 'America/Sao_Paulo')::date - n;
  cut_ts timestamptz := now() - make_interval(days => n);
  removed bigint;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  if p_kind = 'page_visits' then
    delete from public.page_visits v where v.visited_on < cut_date;
  elsif p_kind = 'landing_events' then
    delete from public.landing_events e where e.visited_on < cut_date;
  elsif p_kind = 'site_pageviews' then
    delete from public.site_pageviews e where e.visited_on < cut_date;
  elsif p_kind = 'site_engagement' then
    delete from public.site_engagement e where e.visited_on < cut_date;
  elsif p_kind = 'auth_events' then
    delete from public.auth_events e where e.visited_on < cut_date;
  elsif p_kind = 'user_events' then
    delete from public.user_events e where e.day < cut_date;
  elsif p_kind = 'email_log' then
    delete from public.email_log e where e.sent_on < cut_date;
  elsif p_kind = 'notification_log' then
    delete from public.notification_log l where l.created_at < cut_ts;
  elsif p_kind = 'client_errors' then
    delete from public.client_errors c where c.created_at < cut_ts;
  else
    raise exception 'invalid_kind';
  end if;
  get diagnostics removed = row_count;

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), null, 'purgeOldData', jsonb_build_object('kind', p_kind, 'days', n, 'removed', removed));
  return removed;
end;
$$;
