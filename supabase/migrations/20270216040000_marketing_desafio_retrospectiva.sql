-- Conteúdo novo na fila de publicação automática: carrossel "Desafio de 7 dias" (feed)
-- e Reel da retrospectiva do mês. Artes e vídeo: marketing-autopost-content.mjs e
-- marketing-reels.mjs. Idempotente (on conflict do nothing); entram no fim da fila.
insert into public.marketing_autopost_queue (position, key, format, slot, caption, media)
select (select coalesce(max(position), 0) from public.marketing_autopost_queue) + v.n, v.key, v.format, null, v.caption, v.media::jsonb
from (values
  (1, 'desafio-7-dias-feed', 'feed', 'Sete dias para criar o hábito. 🔥
Salve este post, marque quem vai topar e comece hoje.

Comece agora. Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/desafio-7-dias-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/desafio-7-dias-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/desafio-7-dias-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/desafio-7-dias-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/desafio-7-dias-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/desafio-7-dias-6.jpg"}]'),
  (2, 'retrospectiva-reel', 'reel', 'Quantos treinos você fez este mês? 📅
O app mostra o total de treinos, o volume, os recordes e a melhor sequência, e compara com o mês anterior.

Comece agora. Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"video","url":"https://eafit.com.br/img/marketing/reel-retrospectiva.mp4"}]')
) as v(n, key, format, caption, media)
on conflict (key) do nothing;
