-- Agenda a send-run-challenge-alerts de hora em hora (a função só age entre 9h e 21h
-- de Brasília). Aplicar só DEPOIS de implantar a função (com --no-verify-jwt).
--
-- Pra desligar: select cron.unschedule('send-run-challenge-alerts-hourly');
select cron.schedule(
  'send-run-challenge-alerts-hourly',
  '10 * * * *',
  $$
  select net.http_post(
    url := 'https://btzdetvoneyhzthsmdrp.supabase.co/functions/v1/send-run-challenge-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    )
  );
  $$
);
