-- Marketing do Run: as 18 peças de suspense passam a ser VÍDEO com música (stories, feeds e Reels), fecham com
-- "EM BREVE · Aguarde" e o convite para a lista de espera, e a copy pede resposta, comentário, salvamento e marcação.
-- Gerado por app-admin/scripts/marketing-corrida-suspense.mjs. Só atualiza o que ainda não saiu; o feed com um vídeo
-- só sai como vídeo no feed (Instagram publica como Reel, Facebook como vídeo).
update public.marketing_autopost_queue q
set caption = v.caption, media = v.media::jsonb
from (values
  ('suspense-corrida-s01-story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-story-s01.mp4"}]'),
  ('suspense-corrida-s02-story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-story-s02.mp4"}]'),
  ('suspense-corrida-s03-story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-story-s03.mp4"}]'),
  ('suspense-corrida-s04-story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-story-s04.mp4"}]'),
  ('suspense-corrida-s05-story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-story-s05.mp4"}]'),
  ('suspense-corrida-s06-story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-story-s06.mp4"}]'),
  ('suspense-corrida-s07-story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-story-s07.mp4"}]'),
  ('suspense-corrida-s08-story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-story-s08.mp4"}]'),
  ('suspense-corrida-s09-story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-story-s09.mp4"}]'),
  ('suspense-corrida-s10-story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-story-s10.mp4"}]'),
  ('suspense-corrida-f01-feed', 'Quem corre vai entender. 🏃
Aquela vontade de calçar o tênis e sair já tem novidade a caminho no EAFIT.

Marque aquele amigo que não perde uma corrida. 👇

Quer ser avisado quando abrir? Entre na lista de espera: eafit.com.br/corrida/?origem=post#avise-me 🏃

#corrida #corridaderua #running #embreve #EAFIT', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-feed-f01.mp4"}]'),
  ('suspense-corrida-f02-feed', 'Manhã ☀️ ou noite 🌙? Conta nos comentários a sua hora de correr.
Vem novidade no EAFIT para quem ama correr.

Quer ser avisado quando abrir? Entre na lista de espera: eafit.com.br/corrida/?origem=post#avise-me 🏃

#corrida #corridaderua #running #embreve #EAFIT', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-feed-f02.mp4"}]'),
  ('suspense-corrida-f03-feed', 'Anote na agenda: 1º de dezembro, às 10h. 📅
Salve este post para não esquecer. A novidade do EAFIT para quem ama correr abre para todo mundo nesse dia.

Quer ser avisado quando abrir? Entre na lista de espera: eafit.com.br/corrida/?origem=post#avise-me 🏃

#corrida #corridaderua #running #embreve #EAFIT', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-feed-f03.mp4"}]'),
  ('suspense-corrida-f04-feed', 'Falta pouco. ⏳
Quem aí já está contando os dias? Comenta 🔥 e entre na lista de espera para ser avisado.

Quer ser avisado quando abrir? Entre na lista de espera: eafit.com.br/corrida/?origem=post#avise-me 🏃

#corrida #corridaderua #running #embreve #EAFIT', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-feed-f04.mp4"}]'),
  ('suspense-corrida-r01-reel', 'Você corre? 🏃
Algo novo vem aí no EAFIT, para quem ama correr. Comenta EU se você corre. 👇

Quer ser avisado quando abrir? Entre na lista de espera: eafit.com.br/corrida/?origem=post#avise-me 🏃

#corrida #corridaderua #running #embreve #EAFIT', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-reel-r01.mp4"}]'),
  ('suspense-corrida-r02-reel', 'Quem corre vai entender. 👟
Dia 1º de dezembro tem novidade no EAFIT. Marque quem corre com você.

Quer ser avisado quando abrir? Entre na lista de espera: eafit.com.br/corrida/?origem=post#avise-me 🏃

#corrida #corridaderua #running #embreve #EAFIT', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-reel-r02.mp4"}]'),
  ('suspense-corrida-r03-reel', 'Prepare o tênis. 👟
Dia 1º de dezembro, às 10h, o EAFIT tem novidade para quem corre. Salve para lembrar.

Quer ser avisado quando abrir? Entre na lista de espera: eafit.com.br/corrida/?origem=post#avise-me 🏃

#corrida #corridaderua #running #embreve #EAFIT', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-reel-r03.mp4"}]'),
  ('suspense-corrida-r04-reel', 'Não conta pra ninguém… ou conta, e chama a turma. 😉
Vem novidade no EAFIT para quem ama correr. Compartilhe com a turma.

Quer ser avisado quando abrir? Entre na lista de espera: eafit.com.br/corrida/?origem=post#avise-me 🏃

#corrida #corridaderua #running #embreve #EAFIT', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-reel-r04.mp4"}]')
) as v(key, caption, media)
where q.key = v.key and q.posted_at is null;
