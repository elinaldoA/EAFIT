-- Conteúdo novo na fila de publicação automática: carrossel "Erros de quem está começando
-- na academia" (público: aluno). Artes: marketing-autopost-content.mjs. Idempotente.
insert into public.marketing_autopost_queue (position, key, format, slot, caption, media)
select (select coalesce(max(position), 0) from public.marketing_autopost_queue) + v.n, v.key, v.format, null, v.caption, v.media::jsonb
from (values
  (1, 'erros-iniciante-feed', 'feed', 'Começar errado atrasa o resultado. ⚠️
Salve este post e mande para quem acabou de entrar na academia.

Comece agora. Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/erros-iniciante-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/erros-iniciante-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/erros-iniciante-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/erros-iniciante-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/erros-iniciante-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/erros-iniciante-6.jpg"}]')
) as v(n, key, format, caption, media)
on conflict (key) do nothing;
