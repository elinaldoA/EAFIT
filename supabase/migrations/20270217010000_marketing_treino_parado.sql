-- Conteúdo novo na fila de publicação automática: carrossel "Seu treino está parado? 3 sinais"
-- (feed). Artes: marketing-autopost-content.mjs. Idempotente; entra no fim da fila.
insert into public.marketing_autopost_queue (position, key, format, slot, caption, media)
select (select coalesce(max(position), 0) from public.marketing_autopost_queue) + v.n, v.key, v.format, null, v.caption, v.media::jsonb
from (values
  (1, 'treino-parado-feed', 'feed', 'Treinar sem evoluir cansa. 😮‍💨
Se você se viu em algum destes sinais, salve este post e mude isso hoje.

Comece agora. Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/treino-parado-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/treino-parado-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/treino-parado-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/treino-parado-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/treino-parado-5.jpg"}]')
) as v(n, key, format, caption, media)
on conflict (key) do nothing;
