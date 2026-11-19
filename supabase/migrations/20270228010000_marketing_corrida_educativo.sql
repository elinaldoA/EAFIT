-- Marketing do módulo Corrida: carrosséis educativos e de produto (pós-lançamento).
-- Gerado por app-admin/scripts/marketing-corrida-educativo.mjs. Entram no FIM da fila pendente e só
-- saem com o módulo Corrida ligado.
insert into public.marketing_autopost_queue (position, key, format, caption, media, requires_module)
select (select coalesce(max(position), 0) from public.marketing_autopost_queue) + v.n, v.key, v.format, v.caption, v.media::jsonb, 'corrida'
from (values
  (1, 'corrida-edu-mitos-feed', 'feed', 'Quantos desses mitos você já ouviu? 🤔
Salve este post e mande para quem diz que não nasceu para correr.

Comece agora. Link na bio 👇

#corrida #corridaderua #running #treino #EAFIT', '[{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-mitos-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-mitos-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-mitos-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-mitos-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-mitos-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-mitos-6.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-mitos-7.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-mitos-8.jpg"}]'),
  (2, 'corrida-edu-mitos-reel', 'reel', 'Correr estraga o joelho? Tem que correr todo dia? 🤔
Com plano, progressão e descanso, correr fica mais seguro e mais leve.

Comece agora. Link na bio 👇

#corrida #corridaderua #running #treino #EAFIT', '[{"type":"video","url":"https://eafit.com.br/img/marketing/reel-corrida-edu-mitos.mp4"}]'),
  (3, 'corrida-edu-mitos-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-corrida-edu-mitos.mp4"}]'),
  (4, 'corrida-edu-aquecimento-feed', 'feed', 'Cinco minutos de aquecimento mudam a sua corrida. 🔥
Salve este roteiro e use antes de calçar o tênis.

Comece agora. Link na bio 👇

#corrida #corridaderua #running #treino #EAFIT', '[{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-aquecimento-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-aquecimento-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-aquecimento-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-aquecimento-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-aquecimento-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-aquecimento-6.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-aquecimento-7.jpg"}]'),
  (5, 'corrida-edu-aquecimento-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-corrida-edu-aquecimento.mp4"}]'),
  (6, 'corrida-edu-forca-feed', 'feed', 'Quem corre e treina força corre melhor. 💪
No EAFIT, o programa de corrida já inclui o treino de força para corredor.

Comece agora. Link na bio 👇

#corrida #corridaderua #running #treino #EAFIT', '[{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-forca-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-forca-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-forca-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-forca-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-forca-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-forca-6.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-forca-7.jpg"}]'),
  (7, 'corrida-edu-forca-reel', 'reel', 'Quem corre e treina força corre melhor. 💪
O programa de corrida do EAFIT já inclui o treino de força para corredor.

Comece agora. Link na bio 👇

#corrida #corridaderua #running #treino #EAFIT', '[{"type":"video","url":"https://eafit.com.br/img/marketing/reel-corrida-edu-forca.mp4"}]'),
  (8, 'corrida-edu-lesao-feed', 'feed', 'Correr por mais tempo começa por se cuidar. 🩹
Salve estas dicas para consultar sempre.

Comece agora. Link na bio 👇

#corrida #corridaderua #running #treino #EAFIT', '[{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-lesao-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-lesao-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-lesao-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-lesao-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-lesao-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-lesao-6.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-lesao-7.jpg"}]'),
  (9, 'corrida-edu-tenis-feed', 'feed', 'Tênis certo, corrida mais confortável. 👟
Salve este guia antes da próxima compra.

Comece agora. Link na bio 👇

#corrida #corridaderua #running #treino #EAFIT', '[{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-tenis-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-tenis-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-tenis-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-tenis-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-tenis-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-tenis-6.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-tenis-7.jpg"}]'),
  (10, 'corrida-edu-pre-corrida-feed', 'feed', 'Preparação simples, corrida melhor. ⏱️
Salve este checklist para o dia da prova.

Comece agora. Link na bio 👇

#corrida #corridaderua #running #treino #EAFIT', '[{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-pre-corrida-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-pre-corrida-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-pre-corrida-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-pre-corrida-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-pre-corrida-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-pre-corrida-6.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-pre-corrida-7.jpg"}]'),
  (11, 'corrida-edu-primeira-prova-feed', 'feed', 'A primeira prova não precisa dar medo. 🏁
O EAFIT Run mostra as próximas corridas do seu estado para você escolher a sua.

Comece agora. Link na bio 👇

#corrida #corridaderua #running #treino #EAFIT', '[{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-primeira-prova-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-primeira-prova-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-primeira-prova-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-primeira-prova-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-primeira-prova-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-primeira-prova-6.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-primeira-prova-7.jpg"}]'),
  (12, 'corrida-edu-primeira-prova-reel', 'reel', 'A primeira prova não precisa dar medo. 🏁
O EAFIT Run mostra as próximas corridas do seu estado para você escolher a sua.

Comece agora. Link na bio 👇

#corrida #corridaderua #running #treino #EAFIT', '[{"type":"video","url":"https://eafit.com.br/img/marketing/reel-corrida-edu-primeira-prova.mp4"}]'),
  (13, 'corrida-edu-provas-story', 'story', '', '[{"type":"video","url":"https://eafit.com.br/img/marketing/story-corrida-edu-provas.mp4"}]')
) as v(n, key, format, caption, media)
where not exists (select 1 from public.marketing_autopost_queue q where q.key = v.key);
