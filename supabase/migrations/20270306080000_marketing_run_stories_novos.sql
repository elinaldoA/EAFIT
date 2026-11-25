-- Marketing do Run: 6 stories de suspense NOVOS (s11 a s16), sem repetir os já postados, e nova ordem de saída
-- (1 por dia, 12:30 BRT) até o lançamento em 1º/12. Gerado por app-admin/scripts/marketing-corrida-suspense.mjs (NOVAS=1).
insert into public.marketing_autopost_queue (position, key, format, caption, media, hide_when_module)
select 0, v.key, 'story', '', v.media::jsonb, 'corrida'
from (values
  ('suspense-corrida-s11-story', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-story-s11.mp4"}]'),
  ('suspense-corrida-s12-story', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-story-s12.mp4"}]'),
  ('suspense-corrida-s13-story', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-story-s13.mp4"}]'),
  ('suspense-corrida-s14-story', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-story-s14.mp4"}]'),
  ('suspense-corrida-s15-story', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-story-s15.mp4"}]'),
  ('suspense-corrida-s16-story', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-story-s16.mp4"}]')
) as v(key, media)
where not exists (select 1 from public.marketing_autopost_queue q where q.key = v.key);

update public.marketing_autopost_queue q
set position = v.pos
from (values
  ('suspense-corrida-s15-story', -99),
  ('suspense-corrida-s11-story', -98),
  ('suspense-corrida-s12-story', -97),
  ('suspense-corrida-s13-story', -96),
  ('suspense-corrida-s10-story', -95),
  ('suspense-corrida-s16-story', -94),
  ('suspense-corrida-s14-story', -93),
  ('suspense-corrida-s03-story', -92),
  ('suspense-corrida-s04-story', -91),
  ('suspense-corrida-s05-story', -90),
  ('suspense-corrida-s06-story', -89),
  ('suspense-corrida-s07-story', -88),
  ('suspense-corrida-s08-story', -87),
  ('suspense-corrida-s09-story', -86)
) as v(key, pos)
where q.key = v.key and q.posted_at is null;
