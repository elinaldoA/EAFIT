-- Terceira leva da publicação automática: 8 telas novas do app (volume por músculo,
-- evolução de carga, constância, recordes, peso e medidas, sugestão de carga, macros
-- e gasto real). Cada tema tem uma arte do feed e um story em vídeo (13h), no fim da fila.
-- Artes e vídeos: app-admin/scripts/marketing-autopost-content.mjs e marketing-stories.mjs.
insert into public.marketing_autopost_queue (position, key, format, slot, caption, media)
select (select coalesce(max(position), 0) from public.marketing_autopost_queue) + v.n, v.key, v.format, null, v.caption, v.media::jsonb
from (values
  (1, 'musculos-feed', 'feed', 'Peito em dia e posterior esquecido? 👀
O app conta as séries da semana de cada músculo e mostra o que está ficando para trás.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/musculos-feed.jpg"}]'),
  (2, 'musculos-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-musculos.mp4"}]'),
  (3, 'carga-feed', 'feed', 'Lembra quanto você pegava no agachamento mês passado? 📈
No app, cada exercício tem o gráfico da sua carga ao longo das semanas.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/carga-feed.jpg"}]'),
  (4, 'carga-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-carga.mp4"}]'),
  (5, 'consistencia-feed', 'feed', 'Resultado é constância. 🔥
O app mostra cada dia treinado e quantos treinos você fez por semana. Dá vontade de não quebrar a sequência.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/consistencia-feed.jpg"}]'),
  (6, 'consistencia-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-consistencia.mp4"}]'),
  (7, 'recordes-feed', 'feed', 'Bateu recorde no leg press? 🏆
O app guarda a maior carga de cada exercício e estima o seu 1RM, sem planilha.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/recordes-feed.jpg"}]'),
  (8, 'recordes-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-recordes.mp4"}]'),
  (9, 'corpo-feed', 'feed', 'A balança não conta tudo. 📏
Registre peso e medidas (cintura, quadril, braço, coxa) e veja a evolução em gráfico.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/corpo-feed.jpg"}]'),
  (10, 'corpo-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-corpo.mp4"}]'),
  (11, 'progressao-feed', 'feed', 'Subo a carga ou repito? 🤔
O app olha o seu último treino e sugere a carga e as repetições de hoje, com séries de aquecimento.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/progressao-feed.jpg"}]'),
  (12, 'progressao-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-progressao.mp4"}]'),
  (13, 'nutricao-macros-feed', 'feed', 'Bateu a proteína hoje? 🍗
O app soma as calorias e os macros de cada refeição e mostra quanto falta para a meta.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/nutricao-macros-feed.jpg"}]'),
  (14, 'nutricao-macros-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-nutricao-macros.mp4"}]'),
  (15, 'nutricao-semana-feed', 'feed', 'Comendo certo e o peso não muda? ⚖️
Com o diário alimentar e o seu peso, o app estima o seu gasto real e ajusta a meta de calorias.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/nutricao-semana-feed.jpg"}]'),
  (16, 'nutricao-semana-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-nutricao-semana.mp4"}]')
) as v(n, key, format, caption, media)
on conflict (key) do nothing;
