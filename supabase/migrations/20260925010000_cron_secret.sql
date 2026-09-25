-- Reagenda os dois crons que chamam Edge Functions com Verify JWT desligado
-- (send-reminders, send-scheduled-broadcast) pra mandarem o header
-- x-cron-secret — as funções passam a recusar qualquer chamada sem ele (ver
-- supabase/functions/_shared/cronAuth.ts). Antes, a URL pública aceitava
-- chamada de qualquer um.
--
-- O segredo é gerado aqui mesmo, dentro do Supabase Vault, e nunca aparece no
-- repositório. O cron lê o valor do Vault a cada execução.
--
-- Passos manuais DEPOIS de aplicar esta migration (nessa ordem):
--   1. Ler o segredo gerado (SQL editor):
--        select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret';
--   2. Salvar o mesmo valor como secret CRON_SECRET das Edge Functions
--      (dashboard → Edge Functions → Secrets, ou
--       `supabase secrets set CRON_SECRET=<valor>`).
--   3. Reimplantar send-reminders e send-scheduled-broadcast.
-- Até o passo 3, as versões antigas das funções ignoram o header e continuam
-- funcionando normalmente; depois dele, só o cron consegue chamá-las.

select vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text, 'cron_secret', 'Header x-cron-secret das Edge Functions chamadas pelo pg_cron')
where not exists (select 1 from vault.secrets where name = 'cron_secret');

-- cron.schedule com um nome já existente substitui o job (mesmo comando da
-- 20260702000000_push_reminders_setup.sql / 20260717040000_admin_backlog.sql,
-- só acrescentando o header).
select cron.schedule(
  'send-reminders-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://btzdetvoneyhzthsmdrp.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    )
  );
  $$
);

select cron.schedule(
  'send-scheduled-broadcasts-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://btzdetvoneyhzthsmdrp.supabase.co/functions/v1/send-scheduled-broadcast',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    )
  );
  $$
);
