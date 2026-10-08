-- E-mail semanal (resumo da semana / convite pra voltar): agenda a Edge
-- Function send-weekly-emails pra toda segunda às 09:00 de Brasília (12:00
-- UTC). Mesmo padrão dos outros crons (20260925010000_cron_secret.sql): o
-- header x-cron-secret é lido do Vault a cada execução.
--
-- Aplicar só DEPOIS de implantar a função send-weekly-emails; antes disso o
-- cron chamaria um endereço que não existe (sem efeito, mas sem e-mail).
--
-- Antes de agendar, vale conferir quantas pessoas receberiam, sem enviar nada
-- (o resultado aparece em net._http_response alguns segundos depois):
--   select net.http_post(
--     url := 'https://btzdetvoneyhzthsmdrp.supabase.co/functions/v1/send-weekly-emails?dry=1',
--     headers := jsonb_build_object('Content-Type', 'application/json',
--       'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')));
--   select status_code, content from net._http_response order by id desc limit 1;
--
-- Pra desligar: select cron.unschedule('send-weekly-emails-monday');
select cron.schedule(
  'send-weekly-emails-monday',
  '0 12 * * 1',
  $$
  select net.http_post(
    url := 'https://btzdetvoneyhzthsmdrp.supabase.co/functions/v1/send-weekly-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    )
  );
  $$
);
