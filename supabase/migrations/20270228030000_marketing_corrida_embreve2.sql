-- Marketing do módulo Corrida: 2ª leva "Em breve" (provas perto de você, sua prova, cartão de compartilhar,
-- tênis, clima e desafio da semana, mais 2 carrosséis de dicas). Gerado por
-- app-admin/scripts/marketing-corrida-embreve2.mjs. Saem com o módulo Corrida DESLIGADO (mesmo critério do
-- pré-lançamento: o foco na campanha só libera itens da campanha) e param quando ele liga.
insert into public.marketing_autopost_queue (position, key, format, caption, media, hide_when_module)
select (select coalesce(max(position), 0) from public.marketing_autopost_queue) + v.n, v.key, v.format, v.caption, v.media::jsonb, 'corrida'
from (values
  (1, 'embreve-corrida-provas-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-embreve-corrida-provas.mp4"}]'),
  (2, 'embreve-corrida-sua-prova-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-embreve-corrida-sua-prova.mp4"}]'),
  (3, 'embreve-corrida-sua-prova-reel', 'reel', 'Marcou a sua prova? Então o app conta os dias por você. 🏁
Em breve no EAFIT Run: escolha a corrida, veja quanto falta e receba o programa de treino até lá.

Fique de olho: em breve no EAFIT. 👀

#corrida #corridaderua #running #embreve #EAFIT', '[{"type":"video","url":"https://eafit.com.br/img/marketing/reel-embreve-corrida-sua-prova.mp4"}]'),
  (4, 'embreve-corrida-ritmo-feed', 'feed', 'Correr devagar também é treinar. 🗣️
Salve este post e mande para o seu parceiro de corrida.
Em breve no EAFIT Run: ritmo por km e programa de treino no app.

Fique de olho: em breve no EAFIT. 👀

#corrida #corridaderua #running #embreve #EAFIT', '[{"type":"image","url":"https://eafit.com.br/img/marketing/embreve-corrida-ritmo-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/embreve-corrida-ritmo-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/embreve-corrida-ritmo-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/embreve-corrida-ritmo-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/embreve-corrida-ritmo-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/embreve-corrida-ritmo-6.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/embreve-corrida-ritmo-7.jpg"}]'),
  (5, 'embreve-corrida-cartao-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-embreve-corrida-cartao.mp4"}]'),
  (6, 'embreve-corrida-tenis-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-embreve-corrida-tenis.mp4"}]'),
  (7, 'embreve-corrida-10k-feed', 'feed', 'Primeiros 10 km sem improviso. 🏁
Salve estes passos para o seu treino.
Em breve no EAFIT Run: escolha a prova, veja quanto falta e siga o programa de 10K.

Fique de olho: em breve no EAFIT. 👀

#corrida #corridaderua #running #embreve #EAFIT', '[{"type":"image","url":"https://eafit.com.br/img/marketing/embreve-corrida-10k-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/embreve-corrida-10k-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/embreve-corrida-10k-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/embreve-corrida-10k-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/embreve-corrida-10k-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/embreve-corrida-10k-6.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/embreve-corrida-10k-7.jpg"}]'),
  (8, 'embreve-corrida-clima-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-embreve-corrida-clima.mp4"}]'),
  (9, 'embreve-corrida-semana-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-embreve-corrida-semana.mp4"}]')
) as v(n, key, format, caption, media)
where not exists (select 1 from public.marketing_autopost_queue q where q.key = v.key);
