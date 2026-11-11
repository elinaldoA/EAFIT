-- Conteúdo novo na fila de publicação automática: Reel "Treino em 20 minutos" (enxugar o
-- treino do dia). Vídeo: marketing-reels.mjs. Idempotente; entra no fim da fila.
insert into public.marketing_autopost_queue (position, key, format, slot, caption, media)
select (select coalesce(max(position), 0) from public.marketing_autopost_queue) + v.n, v.key, v.format, null, v.caption, v.media::jsonb
from (values
  (1, 'tempo-curto-reel', 'reel', 'Sem tempo não precisa ser sem treino. ⏱️
Escolha 20, 30 ou 45 minutos e o app enxuga só o treino de hoje, mantendo os exercícios principais. Amanhã o plano volta inteiro.

Comece agora. Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"video","url":"https://eafit.com.br/img/marketing/reel-tempo-curto.mp4"}]')
) as v(n, key, format, caption, media)
on conflict (key) do nothing;
