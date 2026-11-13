-- E-mail de ativação (send-activation-emails): todo dia às 10:00 de Brasília
-- (13:00 UTC), lembra de dar o primeiro treino quem criou a conta há 2 ou 5
-- dias, tem plano e ainda não finalizou nenhum treino. Em produção, só 10 de
-- 34 contas finalizaram um treino, e o push só alcança quem ativou as
-- notificações; o resumo semanal chegava a essa pessoa só depois de 7 a 13 dias.
--
-- Aplicar só DEPOIS de implantar a função (com --no-verify-jwt). Para conferir
-- quantas pessoas receberiam hoje, sem enviar nada:
--   select net.http_post(
--     url := 'https://btzdetvoneyhzthsmdrp.supabase.co/functions/v1/send-activation-emails?dry=1',
--     headers := jsonb_build_object('Content-Type', 'application/json',
--       'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')));
--   select status_code, content from net._http_response order by id desc limit 1;
--
-- Pra desligar: select cron.unschedule('send-activation-emails-daily');
select cron.schedule(
  'send-activation-emails-daily',
  '0 13 * * *',
  $$
  select net.http_post(
    url := 'https://btzdetvoneyhzthsmdrp.supabase.co/functions/v1/send-activation-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    )
  );
  $$
);
