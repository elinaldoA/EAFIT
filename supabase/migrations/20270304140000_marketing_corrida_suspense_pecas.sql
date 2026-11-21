-- Marketing do Run: peças de SUSPENSE para 21/11 a 30/11 (só texto, sem telas nem funções do módulo), com o convite
-- para a lista de espera. Geradas por app-admin/scripts/marketing-corrida-suspense.mjs. Saem com o módulo desligado
-- (hide_when_module = 'corrida') e param quando ele liga; as peças de lançamento e pós-lançamento seguem à parte.
insert into public.marketing_autopost_queue (position, key, format, caption, media, hide_when_module)
select (select coalesce(max(position), 0) from public.marketing_autopost_queue) + v.n, v.key, v.format, v.caption, v.media::jsonb, 'corrida'
from (values
  (1, 'suspense-corrida-s01-story', 'story', '', '[{"type":"image","url":"https://eafit.com.br/img/marketing/suspense-corrida-story-s01.jpg"}]'),
  (2, 'suspense-corrida-s02-story', 'story', '', '[{"type":"image","url":"https://eafit.com.br/img/marketing/suspense-corrida-story-s02.jpg"}]'),
  (3, 'suspense-corrida-s03-story', 'story', '', '[{"type":"image","url":"https://eafit.com.br/img/marketing/suspense-corrida-story-s03.jpg"}]'),
  (4, 'suspense-corrida-s04-story', 'story', '', '[{"type":"image","url":"https://eafit.com.br/img/marketing/suspense-corrida-story-s04.jpg"}]'),
  (5, 'suspense-corrida-s05-story', 'story', '', '[{"type":"image","url":"https://eafit.com.br/img/marketing/suspense-corrida-story-s05.jpg"}]'),
  (6, 'suspense-corrida-s06-story', 'story', '', '[{"type":"image","url":"https://eafit.com.br/img/marketing/suspense-corrida-story-s06.jpg"}]'),
  (7, 'suspense-corrida-s07-story', 'story', '', '[{"type":"image","url":"https://eafit.com.br/img/marketing/suspense-corrida-story-s07.jpg"}]'),
  (8, 'suspense-corrida-s08-story', 'story', '', '[{"type":"image","url":"https://eafit.com.br/img/marketing/suspense-corrida-story-s08.jpg"}]'),
  (9, 'suspense-corrida-s09-story', 'story', '', '[{"type":"image","url":"https://eafit.com.br/img/marketing/suspense-corrida-story-s09.jpg"}]'),
  (10, 'suspense-corrida-s10-story', 'story', '', '[{"type":"image","url":"https://eafit.com.br/img/marketing/suspense-corrida-story-s10.jpg"}]'),
  (11, 'suspense-corrida-f01-feed', 'feed', 'Quem corre vai entender. 🏃
Aquela vontade de calçar o tênis e sair já tem novidade a caminho no EAFIT.

Quer ser avisado quando abrir? Entre na lista de espera: eafit.com.br/corrida/?origem=post#avise-me 🏃

#corrida #corridaderua #running #embreve #EAFIT', '[{"type":"image","url":"https://eafit.com.br/img/marketing/suspense-corrida-feed-f01.jpg"}]'),
  (12, 'suspense-corrida-f02-feed', 'feed', 'Manhã, noite ou fim de semana? 🌅🌙
Conta nos comentários quando você corre. Vem novidade no EAFIT para quem ama correr.

Quer ser avisado quando abrir? Entre na lista de espera: eafit.com.br/corrida/?origem=post#avise-me 🏃

#corrida #corridaderua #running #embreve #EAFIT', '[{"type":"image","url":"https://eafit.com.br/img/marketing/suspense-corrida-feed-f02.jpg"}]'),
  (13, 'suspense-corrida-f03-feed', 'feed', 'Anote na agenda: 1º de dezembro, às 10h. 📅
A novidade do EAFIT para quem ama correr abre para todo mundo nesse dia.

Quer ser avisado quando abrir? Entre na lista de espera: eafit.com.br/corrida/?origem=post#avise-me 🏃

#corrida #corridaderua #running #embreve #EAFIT', '[{"type":"image","url":"https://eafit.com.br/img/marketing/suspense-corrida-feed-f03.jpg"}]'),
  (14, 'suspense-corrida-f04-feed', 'feed', 'Falta pouco. ⏳
Dia 1º de dezembro tem novidade para quem corre. Entre na lista de espera e seja avisado.

Quer ser avisado quando abrir? Entre na lista de espera: eafit.com.br/corrida/?origem=post#avise-me 🏃

#corrida #corridaderua #running #embreve #EAFIT', '[{"type":"image","url":"https://eafit.com.br/img/marketing/suspense-corrida-feed-f04.jpg"}]'),
  (15, 'suspense-corrida-r01-reel', 'reel', 'Você corre? 🏃
Algo novo vem aí no EAFIT, para quem ama correr.

Quer ser avisado quando abrir? Entre na lista de espera: eafit.com.br/corrida/?origem=post#avise-me 🏃

#corrida #corridaderua #running #embreve #EAFIT', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-reel-r01.mp4"}]'),
  (16, 'suspense-corrida-r02-reel', 'reel', 'Quem corre vai entender. 👟
Dia 1º de dezembro tem novidade no EAFIT.

Quer ser avisado quando abrir? Entre na lista de espera: eafit.com.br/corrida/?origem=post#avise-me 🏃

#corrida #corridaderua #running #embreve #EAFIT', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-reel-r02.mp4"}]'),
  (17, 'suspense-corrida-r03-reel', 'reel', 'Prepare o tênis. 👟
Dia 1º de dezembro, às 10h, o EAFIT tem novidade para quem corre.

Quer ser avisado quando abrir? Entre na lista de espera: eafit.com.br/corrida/?origem=post#avise-me 🏃

#corrida #corridaderua #running #embreve #EAFIT', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-reel-r03.mp4"}]'),
  (18, 'suspense-corrida-r04-reel', 'reel', 'Não conta pra ninguém… ou conta, e chama a turma. 😉
Vem novidade no EAFIT para quem ama correr. Entre na lista de espera.

Quer ser avisado quando abrir? Entre na lista de espera: eafit.com.br/corrida/?origem=post#avise-me 🏃

#corrida #corridaderua #running #embreve #EAFIT', '[{"type":"video","url":"https://eafit.com.br/img/marketing/suspense-corrida-reel-r04.mp4"}]')
) as v(n, key, format, caption, media)
where not exists (select 1 from public.marketing_autopost_queue q where q.key = v.key);
