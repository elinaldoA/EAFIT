-- Conteúdo novo na fila de publicação automática: carrossel para personal trainers
-- ("Quanto tempo você perde com a rotina dos alunos?", feed) e Reel para quem quer
-- voltar a treinar. Artes e vídeo: marketing-autopost-content.mjs e marketing-reels.mjs.
-- Idempotente (on conflict do nothing); entram no fim da fila de cada formato.
insert into public.marketing_autopost_queue (position, key, format, slot, caption, media)
select (select coalesce(max(position), 0) from public.marketing_autopost_queue) + v.n, v.key, v.format, null, v.caption, v.media::jsonb
from (values
  (1, 'tempo-personal-feed', 'feed', 'Seu tempo vale mais do que planilha e mensagem repetida. ⏱️
Salve este post e veja o que dá para tirar da sua rotina.

Comece agora. Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/tempo-personal-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/tempo-personal-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/tempo-personal-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/tempo-personal-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/tempo-personal-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/tempo-personal-6.jpg"}]'),
  (2, 'retorno-reel', 'reel', 'Passou um tempo sem treinar? Sem culpa, o importante é voltar. 💪
No histórico do app você vê o que fez no último treino e retoma dali.

Comece agora. Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"video","url":"https://eafit.com.br/img/marketing/reel-retorno.mp4"}]')
) as v(n, key, format, caption, media)
on conflict (key) do nothing;
