-- Marketing do Run: versões PÓS-lançamento dos educativos (carrosséis e Reels), sem "Em breve".
-- Gerado por app-admin/scripts/marketing-corrida-pos-lancamento.mjs. Só saem com o módulo ligado
-- (requires_module = 'corrida'), depois das peças de lançamento, para a faixa de feed e de Reels não ficar
-- vazia nas primeiras semanas. Os itens "Em breve" originais seguem como estão e somem quando o módulo liga.
insert into public.marketing_autopost_queue (position, key, format, caption, media, requires_module)
select (select coalesce(max(position), 0) from public.marketing_autopost_queue) + v.n, v.key, v.format, v.caption, v.media::jsonb, 'corrida'
from (values
  (1, 'corrida-edu-mitos-pos-feed', 'feed', 'Quantos desses mitos você já ouviu? 🤔
Salve este post e mande para quem diz que não nasceu para correr. No EAFIT Run, corra com plano e registre cada corrida.

Abra o app e escolha Corrida em Perfil › Meu esporte. Link na bio. 🏃

#corrida #corridaderua #running #EAFIT', '[{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-mitos-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-mitos-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-mitos-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-mitos-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-mitos-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-mitos-6.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-mitos-7.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-mitos-pos-8.jpg"}]'),
  (2, 'corrida-edu-aquecimento-pos-feed', 'feed', 'Cinco minutos de aquecimento mudam a sua corrida. 🔥
Salve este roteiro e use antes de calçar o tênis. No EAFIT Run, registre cada corrida.

Abra o app e escolha Corrida em Perfil › Meu esporte. Link na bio. 🏃

#corrida #corridaderua #running #EAFIT', '[{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-aquecimento-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-aquecimento-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-aquecimento-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-aquecimento-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-aquecimento-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-aquecimento-6.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-aquecimento-pos-7.jpg"}]'),
  (3, 'corrida-edu-mitos-pos-reel', 'reel', 'Quantos desses mitos você já ouviu? 🤔
Salve este post e mande para quem diz que não nasceu para correr. No EAFIT Run, corra com plano e registre cada corrida.

Abra o app e escolha Corrida em Perfil › Meu esporte. Link na bio. 🏃

#corrida #corridaderua #running #EAFIT', '[{"type":"video","url":"https://eafit.com.br/img/marketing/reel-corrida-edu-mitos-pos.mp4"}]'),
  (4, 'corrida-edu-forca-pos-feed', 'feed', 'Quem corre e treina força corre melhor. 💪
No EAFIT: programa de corrida com treino de força para corredor.

Abra o app e escolha Corrida em Perfil › Meu esporte. Link na bio. 🏃

#corrida #corridaderua #running #EAFIT', '[{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-forca-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-forca-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-forca-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-forca-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-forca-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-forca-6.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-forca-pos-7.jpg"}]'),
  (5, 'corrida-edu-lesao-pos-feed', 'feed', 'Correr por mais tempo começa por se cuidar. 🩹
Salve estas dicas para consultar sempre. No EAFIT Run: programa com plano e descanso.

Abra o app e escolha Corrida em Perfil › Meu esporte. Link na bio. 🏃

#corrida #corridaderua #running #EAFIT', '[{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-lesao-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-lesao-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-lesao-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-lesao-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-lesao-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-lesao-6.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-lesao-pos-7.jpg"}]'),
  (6, 'corrida-edu-forca-pos-reel', 'reel', 'Quem corre e treina força corre melhor. 💪
No EAFIT: programa de corrida com treino de força para corredor.

Abra o app e escolha Corrida em Perfil › Meu esporte. Link na bio. 🏃

#corrida #corridaderua #running #EAFIT', '[{"type":"video","url":"https://eafit.com.br/img/marketing/reel-corrida-edu-forca-pos.mp4"}]'),
  (7, 'corrida-edu-tenis-pos-feed', 'feed', 'Tênis certo, corrida mais confortável. 👟
Salve este guia antes da próxima compra. No EAFIT Run: km de cada tênis.

Abra o app e escolha Corrida em Perfil › Meu esporte. Link na bio. 🏃

#corrida #corridaderua #running #EAFIT', '[{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-tenis-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-tenis-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-tenis-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-tenis-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-tenis-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-tenis-6.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-tenis-pos-7.jpg"}]'),
  (8, 'corrida-edu-pre-corrida-pos-feed', 'feed', 'Preparação simples, corrida melhor. ⏱️
Salve este checklist para o dia da prova. No EAFIT Run: grave a corrida.

Abra o app e escolha Corrida em Perfil › Meu esporte. Link na bio. 🏃

#corrida #corridaderua #running #EAFIT', '[{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-pre-corrida-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-pre-corrida-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-pre-corrida-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-pre-corrida-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-pre-corrida-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-pre-corrida-6.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-pre-corrida-pos-7.jpg"}]'),
  (9, 'corrida-edu-primeira-prova-pos-reel', 'reel', 'A primeira prova não precisa dar medo. 🏁
O EAFIT Run mostra as próximas corridas do seu estado para você escolher a sua.

Abra o app e escolha Corrida em Perfil › Meu esporte. Link na bio. 🏃

#corrida #corridaderua #running #EAFIT', '[{"type":"video","url":"https://eafit.com.br/img/marketing/reel-corrida-edu-primeira-prova-pos.mp4"}]'),
  (10, 'corrida-edu-primeira-prova-pos-feed', 'feed', 'A primeira prova não precisa dar medo. 🏁
O EAFIT Run mostra as próximas corridas do seu estado para você escolher a sua.

Abra o app e escolha Corrida em Perfil › Meu esporte. Link na bio. 🏃

#corrida #corridaderua #running #EAFIT', '[{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-primeira-prova-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-primeira-prova-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-primeira-prova-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-primeira-prova-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-primeira-prova-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-primeira-prova-6.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/corrida-edu-primeira-prova-pos-7.jpg"}]')
) as v(n, key, format, caption, media)
where not exists (select 1 from public.marketing_autopost_queue q where q.key = v.key);
