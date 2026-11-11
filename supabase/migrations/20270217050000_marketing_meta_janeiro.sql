-- Conteúdo novo na fila de publicação automática: carrossel "Monte já o seu treino de janeiro".
-- Tem tema de temporada (ano_novo): só sai de 27/12 a 07/01, quando o tema está no ar no app,
-- e passa na frente dos itens comuns nesse período. Artes: marketing-autopost-content.mjs.
insert into public.marketing_autopost_queue (position, key, format, slot, season, caption, media)
select (select coalesce(max(position), 0) from public.marketing_autopost_queue) + v.n, v.key, v.format, null, v.season, v.caption, v.media::jsonb
from (values
  (1, 'meta-janeiro-feed', 'feed', 'ano_novo', 'Ano novo, treino novo, e desta vez com plano. 🎆
Salve este post e comece janeiro sem improviso.

Comece agora. Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/meta-janeiro-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/meta-janeiro-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/meta-janeiro-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/meta-janeiro-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/meta-janeiro-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/meta-janeiro-6.jpg"}]')
) as v(n, key, format, season, caption, media)
on conflict (key) do nothing;
