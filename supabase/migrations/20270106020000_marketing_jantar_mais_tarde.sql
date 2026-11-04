-- Story do jantar mais tarde (19h30) e feed no lugar dele (18h). Brasília = UTC-3.
--   18:00 feed · 19:30 story jantar · 20:30 reel · 21:30 story ceia
select cron.schedule('marketing-autopost-feed', '0 21 * * *', $$ select public.marketing_autopost_run('feed'); $$);
select cron.schedule('marketing-autopost-story-jantar', '30 22 * * *', $$ select public.marketing_autopost_run('story', 'jantar'); $$);
