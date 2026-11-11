-- Conteúdo novo na fila de publicação automática: carrossel "Mito ou verdade no treino"
-- (feed) e Reel para quem vai à academia pela primeira vez. Artes e vídeo:
-- app-admin/scripts/marketing-autopost-content.mjs e marketing-reels.mjs.
-- Idempotente (on conflict do nothing); entram no fim da fila de cada formato.
insert into public.marketing_autopost_queue (position, key, format, slot, caption, media)
select (select coalesce(max(position), 0) from public.marketing_autopost_queue) + v.n, v.key, v.format, null, v.caption, v.media::jsonb
from (values
  (1, 'mitos-feed', 'feed', 'Você acredita em algum destes? 🤔
Salve este post e mande para quem ainda cai nessas.

Comece agora. Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/mitos-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/mitos-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/mitos-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/mitos-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/mitos-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/mitos-6.jpg"}]'),
  (2, 'iniciante-reel', 'reel', 'Primeira vez na academia e sem saber por onde começar? 😅
No app o treino do dia já está montado e você registra cada série.

Comece agora. Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"video","url":"https://eafit.com.br/img/marketing/reel-iniciante.mp4"}]')
) as v(n, key, format, caption, media)
on conflict (key) do nothing;
