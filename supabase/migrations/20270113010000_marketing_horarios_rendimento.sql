-- Horários da publicação automática reorganizados pelos picos de alcance (Brasília = UTC-3).
--
-- Antes (todo dia): 7h café · 12h almoço · 13h story geral (colado no almoço) ·
-- 15h hidratação · 18h feed · 19h30 jantar · 20h30 reel (3 publicações em 2h30 à noite).
--
-- Agora: feed no pico do almoço (11h-13h nos dias úteis), Reel no pico da noite
-- (20h-22h) e stories espaçados ao longo do dia, sem dois formatos colados. No fim
-- de semana o público acorda e sai mais tarde: café, feed e Reel mudam de horário.
--
--   seg a sex                       sáb e dom
--   06:30 story café                09:00 story café
--   11:30 feed                      10:30 feed
--   12:30 story almoço              12:30 story almoço
--   15:00 story hidratação          15:00 story hidratação
--   17:30 story geral               17:30 story geral
--   19:30 story jantar              18:30 reel
--   20:45 reel                      19:30 story jantar
--
-- Os horários em UTC caem no mesmo dia de Brasília, então o dia da semana do cron
-- (1-5 = seg a sex, 0,6 = sáb e dom) é o mesmo de Brasília.
-- cron.schedule com nome já existente substitui o job. Painel: AUTOPOST_LANES em
-- app-admin/src/lib/marketing.js.

-- Faixas que mudam no fim de semana: um job para seg a sex e outro para sáb e dom.
select cron.schedule('marketing-autopost-story-cafe', '30 9 * * 1-5', $$ select public.marketing_autopost_run('story', 'cafe'); $$);
select cron.schedule('marketing-autopost-story-cafe-fds', '0 12 * * 0,6', $$ select public.marketing_autopost_run('story', 'cafe'); $$);
select cron.schedule('marketing-autopost-feed', '30 14 * * 1-5', $$ select public.marketing_autopost_run('feed'); $$);
select cron.schedule('marketing-autopost-feed-fds', '30 13 * * 0,6', $$ select public.marketing_autopost_run('feed'); $$);
select cron.schedule('marketing-autopost-reel', '45 23 * * 1-5', $$ select public.marketing_autopost_run('reel'); $$);
select cron.schedule('marketing-autopost-reel-fds', '30 21 * * 0,6', $$ select public.marketing_autopost_run('reel'); $$);

-- Faixas iguais todo dia.
select cron.schedule('marketing-autopost-story-almoco', '30 15 * * *', $$ select public.marketing_autopost_run('story', 'almoco'); $$);
select cron.schedule('marketing-autopost-story-agua', '0 18 * * *', $$ select public.marketing_autopost_run('story', 'agua'); $$);
select cron.schedule('marketing-autopost-story', '30 20 * * *', $$ select public.marketing_autopost_run('story'); $$);
select cron.schedule('marketing-autopost-story-jantar', '30 22 * * *', $$ select public.marketing_autopost_run('story', 'jantar'); $$);
