-- Sem story de ceia: tira o cron e os itens pendentes. Mais 8 stories de hidratação (15h), 12 no total.
select cron.unschedule(jobid) from cron.job where jobname = 'marketing-autopost-story-ceia';
delete from public.marketing_autopost_queue where slot = 'ceia' and posted_at is null;

insert into public.marketing_autopost_queue (position, key, format, slot, caption, media) values
  (43, 'nutri-agua-5', 'story', 'agua', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-agua-5.mp4"}]'::jsonb),
  (44, 'nutri-agua-6', 'story', 'agua', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-agua-6.mp4"}]'::jsonb),
  (45, 'nutri-agua-7', 'story', 'agua', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-agua-7.mp4"}]'::jsonb),
  (46, 'nutri-agua-8', 'story', 'agua', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-agua-8.mp4"}]'::jsonb),
  (47, 'nutri-agua-9', 'story', 'agua', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-agua-9.mp4"}]'::jsonb),
  (48, 'nutri-agua-10', 'story', 'agua', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-agua-10.mp4"}]'::jsonb),
  (49, 'nutri-agua-11', 'story', 'agua', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-agua-11.mp4"}]'::jsonb),
  (50, 'nutri-agua-12', 'story', 'agua', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-agua-12.mp4"}]'::jsonb)
on conflict (key) do nothing;
