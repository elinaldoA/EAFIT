-- Conteúdo de temporada na fila (coluna season da 20270111010000): cada peça só
-- sai enquanto o tema dela estiver no ar no app. A peça genérica "temporada"
-- (arte com o tema de Natal) passa a ser do Natal; entram Novembro Azul e Ano Novo.
-- Artes e vídeos: app-admin/scripts/marketing-autopost-content.mjs e marketing-stories.mjs.
update public.marketing_autopost_queue set season = 'natal', caption = 'O app entrou no clima de Natal. 🎄
Treine no período e ganhe a conquista Treino de Natal. Bora fechar o ano em movimento?

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao'
where key = 'temporada-feed' and posted_at is null;
update public.marketing_autopost_queue set season = 'natal'
where key = 'temporada-story' and posted_at is null;

insert into public.marketing_autopost_queue (position, key, format, slot, season, caption, media)
select (select coalesce(max(position), 0) from public.marketing_autopost_queue) + v.n, v.key, v.format, null, v.season, v.caption, v.media::jsonb
from (values
  (1, 'temporada-novembro-azul-feed', 'feed', 'novembro_azul', 'Novembro Azul: mês de cuidar da saúde do homem. 💙
Treino em dia e exames de rotina também. No app, treine no período e ganhe a conquista Novembro Azul.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/temporada-novembro-azul-feed.jpg"}]'),
  (2, 'temporada-novembro-azul-story', 'story', 'novembro_azul', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-temporada-novembro-azul.mp4"}]'),
  (3, 'temporada-ano-novo-feed', 'feed', 'ano_novo', 'Ano novo, treino em dia. 🎆
Faça um treino na primeira semana do ano e ganhe a conquista Ano Novo no app.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/temporada-ano-novo-feed.jpg"}]'),
  (4, 'temporada-ano-novo-story', 'story', 'ano_novo', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-temporada-ano-novo.mp4"}]')
) as v(n, key, format, season, caption, media)
on conflict (key) do nothing;
