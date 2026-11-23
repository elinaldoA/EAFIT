-- Espalha os crons que chamam Edge Functions (pg_net) por minutos diferentes.
--
-- Problema: a Saúde do sistema acusava timeouts de DNS (5 s) nas chamadas do
-- pg_net, sempre nos minutos em que muitos jobs disparavam juntos (:00, :05,
-- :15, :30, :45; no :00 chegavam a 9 chamadas ao mesmo tempo, somando os 3 jobs
-- de todo minuto). Cada função só olha a hora cheia, não o minuto, então mudar
-- o minuto não altera o comportamento.
--
-- cron.alter_job troca só a agenda e preserva o comando de cada job. Job que
-- não existir é ignorado.
--
-- Mapa final (minuto da hora; os 3 jobs de todo minuto continuam como estão):
--   :01 :06 :11 ...  send-trainer-scheduled (a cada 5 min)
--   :02              send-engagement-hourly
--   :03 :18 :33 :48  marketing-sync-comments (a cada 15 min)
--   :08              send-trainer-alerts-hourly
--   :09 :24 :39 :54  resolve-geo-15min (a cada 15 min)
--   :14              send-admin-digest-hourly
--   :19              send-ambassador-alerts-hourly
--   :23              send-charge-reminders-hourly
--   :27              send-run-challenge-alerts-hourly
--   :00 :15 :30 :45  send-appointment-reminders (mantido: lembretes por faixa de 15 min)
--   12:20 seg        send-weekly-emails-monday
--   13:25            send-activation-emails-daily

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('send-trainer-scheduled',         '1-59/5 * * * *'),
      ('send-engagement-hourly',         '2 * * * *'),
      ('marketing-sync-comments',        '3-59/15 * * * *'),
      ('send-trainer-alerts-hourly',     '8 * * * *'),
      ('resolve-geo-15min',              '9-59/15 * * * *'),
      ('send-admin-digest-hourly',       '14 * * * *'),
      ('send-ambassador-alerts-hourly',  '19 * * * *'),
      ('send-charge-reminders-hourly',   '23 * * * *'),
      ('send-run-challenge-alerts-hourly', '27 * * * *'),
      ('send-weekly-emails-monday',      '20 12 * * 1'),
      ('send-activation-emails-daily',   '25 13 * * *')
    ) as t(name, sched)
  loop
    perform cron.alter_job(j.jobid, schedule := r.sched)
    from cron.job j where j.jobname = r.name;
  end loop;
end $$;
