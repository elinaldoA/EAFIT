-- Limpeza automática diária das tabelas anônimas de medição e do registro de
-- e-mails: apaga o que tem mais de 365 dias. Antes só a limpeza manual do
-- painel (Sistema → Saúde) tocava nelas, então cresciam sem limite.
--
-- Fora daqui, de propósito: user_events e notification_log (o painel e o
-- intervalo entre notificações ainda leem o histórico) e client_errors (tem
-- limpeza própria na tela de erros). app_access_log e app_sessions já têm a
-- deles (180 dias).
--
-- Quem quiser outro prazo muda o intervalo abaixo; a limpeza manual do painel
-- continua valendo para apagar antes.

create or replace function public.purge_old_anonymous_tracking()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  cut_date date := (now() at time zone 'America/Sao_Paulo')::date - 365;
  n bigint;
  total bigint := 0;
begin
  delete from public.page_visits where visited_on < cut_date;
  get diagnostics n = row_count; total := total + n;
  delete from public.landing_events where visited_on < cut_date;
  get diagnostics n = row_count; total := total + n;
  delete from public.site_pageviews where visited_on < cut_date;
  get diagnostics n = row_count; total := total + n;
  delete from public.site_engagement where visited_on < cut_date;
  get diagnostics n = row_count; total := total + n;
  delete from public.auth_events where visited_on < cut_date;
  get diagnostics n = row_count; total := total + n;
  delete from public.email_log where sent_on < cut_date;
  get diagnostics n = row_count; total := total + n;
  return total;
end;
$$;

revoke execute on function public.purge_old_anonymous_tracking() from public, anon, authenticated;
grant execute on function public.purge_old_anonymous_tracking() to service_role;

select cron.schedule('purge-old-anonymous-tracking-daily', '50 6 * * *', $$ select public.purge_old_anonymous_tracking(); $$);
