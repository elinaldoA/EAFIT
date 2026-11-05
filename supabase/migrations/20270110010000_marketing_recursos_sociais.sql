-- Quinta leva da publicação automática: amigos (ranking e atividade), liga do mês,
-- treinador por voz e temporada. Cada tema tem arte do feed e story em vídeo (13h),
-- no fim da fila. Artes e vídeos: app-admin/scripts/marketing-autopost-content.mjs
-- e marketing-stories.mjs.
insert into public.marketing_autopost_queue (position, key, format, slot, caption, media)
select (select coalesce(max(position), 0) from public.marketing_autopost_queue) + v.n, v.key, v.format, null, v.caption, v.media::jsonb
from (values
  (1, 'amigos-feed', 'feed', 'Com amigo junto fica mais difícil faltar. 👊
Adicione os amigos pelo código e dispute o ranking da semana: quem treina mais dias fica no topo.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/amigos-feed.jpg"}]'),
  (2, 'amigos-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-amigos.mp4"}]'),
  (3, 'amigos-atividade-feed', 'feed', 'Seu amigo bateu recorde no agachamento? Manda um 🔥
No app você acompanha os treinos, recordes e sequências dos amigos e reage com 💪 🔥 👏. Só aparece quem escolheu compartilhar.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/amigos-atividade-feed.jpg"}]'),
  (4, 'amigos-atividade-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-amigos-atividade.mp4"}]'),
  (5, 'liga-feed', 'feed', 'Todo mês uma liga nova. 🏅
Você disputa com quem treina no mesmo ritmo (Ouro, Prata ou Bronze) e os 3 primeiros de cada divisão ganham medalha. No ranking aparece só o seu apelido.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/liga-feed.jpg"}]'),
  (6, 'liga-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-liga.mp4"}]'),
  (7, 'treinador-voz-feed', 'feed', 'Treina de fone? 🎧
Ligue o treinador por voz: ele apresenta cada exercício, conta o descanso e comemora os seus recordes. Escolha o jeito de falar: animado, zoeira ou calmo.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/treinador-voz-feed.jpg"}]'),
  (8, 'treinador-voz-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-treinador-voz.mp4"}]'),
  (9, 'temporada-feed', 'feed', 'Carnaval, Outubro Rosa, Dia das Bruxas, Novembro Azul, Natal… 🎉
Em cada data o app ganha um tema e um desafio: treine no período e ganhe uma conquista especial.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/temporada-feed.jpg"}]'),
  (10, 'temporada-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-temporada.mp4"}]')
) as v(n, key, format, caption, media)
on conflict (key) do nothing;
