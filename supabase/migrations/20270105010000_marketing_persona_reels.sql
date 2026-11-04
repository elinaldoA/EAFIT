-- Marketing: dois Reels com personagem (uma mulher e um homem, ilustrados, com a
-- marca EAFIT) falando e usando o app. Entram no começo da faixa de Reels, então
-- saem nos próximos dois dias (às 17h): primeiro ela, depois ele.
insert into public.marketing_autopost_queue (key, position, format, caption, media)
select v.key,
       coalesce((select min(position) from public.marketing_autopost_queue
                 where format = 'reel' and posted_at is null and skipped_at is null), 1) - 2 + v.ord,
       'reel', v.caption, v.media
from (values
  ('persona-ela-reel', 0, 'Planilha, PDF, WhatsApp… dá para simplificar. 👩‍🏫📲
Monte o treino no app EAFIT e envie direto para o celular do aluno.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"video","url":"https://eafit.com.br/img/marketing/reel-ela.mp4"}]'::jsonb),
  ('persona-ele-reel', 1, 'Aluno que vê o progresso não desiste. 💪📈
No app EAFIT, cada carga e cada série viram evolução visível.

Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"video","url":"https://eafit.com.br/img/marketing/reel-ele.mp4"}]'::jsonb)
) as v(key, ord, caption, media)
on conflict do nothing;
