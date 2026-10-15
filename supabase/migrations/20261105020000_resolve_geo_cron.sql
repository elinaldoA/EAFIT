-- Localização das visitas e contas: chama a Edge Function resolve-geo a cada
-- 15 minutos pra converter os IPs pendentes em país/estado/cidade (ver
-- 20261105010000_visit_geo.sql). Mesmo padrão dos outros crons
-- (20260925010000_cron_secret.sql): o header x-cron-secret vem do Vault.
--
-- Aplicar só DEPOIS de implantar a função resolve-geo e configurar o secret
-- IPINFO_TOKEN (opcional — sem ele usa a API pública do ipinfo, com limite
-- menor). Antes disso o cron chamaria um endereço que não existe.
--
-- Pra testar uma rodada na mão:
--   select net.http_post(
--     url := 'https://btzdetvoneyhzthsmdrp.supabase.co/functions/v1/resolve-geo',
--     headers := jsonb_build_object('Content-Type', 'application/json',
--       'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')));
--   select status_code, content from net._http_response order by id desc limit 1;
--
-- Pra desligar: select cron.unschedule('resolve-geo-15min');
select cron.schedule(
  'resolve-geo-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://btzdetvoneyhzthsmdrp.supabase.co/functions/v1/resolve-geo',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    )
  );
  $$
);
