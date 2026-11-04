-- Reajuste dos horários do autopost para os picos de audiência (Brasília = UTC-3).
--
-- Antes: feed 12h (colado no story do almoço, 11h30), reel 17h (antes do pico) e
-- story geral 19h (3 stories em 3h30 junto com jantar 18h e ceia 21h30).
--
-- Agora (Brasília):
--   07:00 story café        (não muda)
--   11:30 story almoço      (não muda)
--   13:00 story geral       (fim do pico do almoço, longe dos stories de refeição)
--   18:00 story jantar      (não muda)
--   19:00 feed              (maior pico fitness: saída do trabalho/treino)
--   20:30 reel              (pico de Reels, 1h30 depois do feed)
--   21:30 story ceia        (não muda)
--
-- cron.schedule com nome já existente substitui o job.
select cron.schedule('marketing-autopost-feed', '0 22 * * *', $$ select public.marketing_autopost_run('feed'); $$);
select cron.schedule('marketing-autopost-reel', '30 23 * * *', $$ select public.marketing_autopost_run('reel'); $$);
select cron.schedule('marketing-autopost-story', '0 16 * * *', $$ select public.marketing_autopost_run('story'); $$);
