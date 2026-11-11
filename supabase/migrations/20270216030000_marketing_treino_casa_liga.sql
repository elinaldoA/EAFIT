-- Conteúdo novo na fila de publicação automática: carrossel "Sem academia? Dá para
-- treinar em casa" (feed) e Reel da liga do mês. Artes e vídeo:
-- marketing-autopost-content.mjs e marketing-reels.mjs.
-- Idempotente (on conflict do nothing); entram no fim da fila de cada formato.
insert into public.marketing_autopost_queue (position, key, format, slot, caption, media)
select (select coalesce(max(position), 0) from public.marketing_autopost_queue) + v.n, v.key, v.format, null, v.caption, v.media::jsonb
from (values
  (1, 'treino-casa-feed', 'feed', 'Não precisa de academia completa para treinar direito. 🏠
Escolha o local no app e o treino se ajusta ao equipamento que você tem.

Comece agora. Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/treino-casa-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/treino-casa-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/treino-casa-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/treino-casa-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/treino-casa-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/treino-casa-6.jpg"}]'),
  (2, 'liga-mes-reel', 'reel', 'Todo mês uma liga nova e uma disputa justa. 🏅
Você compete com quem treina no seu ritmo e os 3 primeiros de cada divisão ganham medalha.

Comece agora. Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"video","url":"https://eafit.com.br/img/marketing/reel-liga-mes.mp4"}]')
) as v(n, key, format, caption, media)
on conflict (key) do nothing;
