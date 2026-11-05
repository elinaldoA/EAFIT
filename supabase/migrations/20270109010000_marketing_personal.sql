-- Quarta leva da publicação automática: material para personal trainers.
-- 8 telas do modo Personal (painel, alunos, treinos e evolução do aluno, montar
-- treino, modelos, conversa e agenda), cada uma com arte do feed e story em vídeo
-- (13h), e 3 carrosséis educativos (consultoria online, quando trocar o treino e
-- a primeira semana do aluno novo). Tudo no fim da fila.
-- Artes e vídeos: app-admin/scripts/marketing-autopost-content.mjs e marketing-stories.mjs.
insert into public.marketing_autopost_queue (position, key, format, slot, caption, media)
select (select coalesce(max(position), 0) from public.marketing_autopost_queue) + v.n, v.key, v.format, null, v.caption, v.media::jsonb
from (values
  (1, 'personal-painel-feed', 'feed', 'Começa o dia sabendo quem precisa de você. 📊
O painel do Personal mostra quem treinou na semana, quem sumiu, quem relatou dor e qual plano está vencendo.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/personal-painel-feed.jpg"}]'),
  (2, 'personal-painel-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-personal-painel.mp4"}]'),
  (3, 'personal-alunos-feed', 'feed', 'Quantos treinos o seu aluno fez essa semana? 🗓️
Na lista de alunos você vê a aderência de cada um, os últimos 14 dias e quando o plano vence.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/personal-alunos-feed.jpg"}]'),
  (4, 'personal-alunos-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-personal-alunos.mp4"}]'),
  (5, 'personal-treinos-feed', 'feed', '"Fiz o treino todo, prof." 😅
Na ficha do aluno você vê cada treino feito: duração, nota, cargas e quantos exercícios evoluíram.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/personal-treinos-feed.jpg"}]'),
  (6, 'personal-treinos-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-personal-treinos.mp4"}]'),
  (7, 'personal-evolucao-feed', 'feed', 'Mostre o resultado, não só fale dele. 📈
Peso, medidas e o check-in de energia, sono e humor de cada aluno, num gráfico pronto para a reavaliação.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/personal-evolucao-feed.jpg"}]'),
  (8, 'personal-evolucao-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-personal-evolucao.mp4"}]'),
  (9, 'personal-montar-feed', 'feed', 'Chega de PDF e print de planilha. 📲
Monte o treino no app (dias, exercícios, séries, descanso e prazo) e ele chega direto no celular do aluno.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/personal-montar-feed.jpg"}]'),
  (10, 'personal-montar-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-personal-montar.mp4"}]'),
  (11, 'personal-modelos-feed', 'feed', 'Monta o mesmo treino toda semana? ♻️
Salve como modelo e envie para um ou vários alunos de uma vez, ajustando só o que muda.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/personal-modelos-feed.jpg"}]'),
  (12, 'personal-modelos-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-personal-modelos.mp4"}]'),
  (13, 'personal-conversa-feed', 'feed', 'Seu WhatsApp não precisa ser o canal de treino. 💬
Mande recados e converse com cada aluno pelo app. Ele recebe uma notificação e responde por lá.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/personal-conversa-feed.jpg"}]'),
  (14, 'personal-conversa-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-personal-conversa.mp4"}]'),
  (15, 'personal-agenda-feed', 'feed', 'Agenda de aulas sem troca de mensagens. 📅
Marque a aula presencial ou online e o aluno confirma pelo app. Tudo aparece no seu painel.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/personal-agenda-feed.jpg"}]'),
  (16, 'personal-agenda-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-personal-agenda.mp4"}]'),
  (17, 'consultoria-feed', 'feed', 'Consultoria online não é mandar uma planilha e sumir. 🌐
Salve estes 5 passos e acompanhe o aluno de longe como se estivesse na academia.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/consultoria-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/consultoria-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/consultoria-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/consultoria-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/consultoria-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/consultoria-6.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/consultoria-7.jpg"}]'),
  (18, 'trocar-treino-feed', 'feed', 'Trocar o treino cedo demais atrapalha. Tarde demais, o aluno desanima. 🔄
Os 4 sinais de que está na hora de mudar.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/trocar-treino-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/trocar-treino-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/trocar-treino-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/trocar-treino-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/trocar-treino-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/trocar-treino-6.jpg"}]'),
  (19, 'primeira-semana-feed', 'feed', 'A primeira semana decide se o aluno fica. 👋
Um roteiro simples para o aluno novo começar bem.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/primeira-semana-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/primeira-semana-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/primeira-semana-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/primeira-semana-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/primeira-semana-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/primeira-semana-6.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/primeira-semana-7.jpg"}]')
) as v(n, key, format, caption, media)
on conflict (key) do nothing;
