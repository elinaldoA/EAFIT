-- Conteúdo novo na fila de publicação automática: carrossel "Você sabia? 4 recursos do EAFIT"
-- (offline, lembretes, biometria e conquistas: temas ainda não publicados).
-- Artes: marketing-autopost-content.mjs. Idempotente; entra no fim da fila.
insert into public.marketing_autopost_queue (position, key, format, slot, caption, media)
select (select coalesce(max(position), 0) from public.marketing_autopost_queue) + v.n, v.key, v.format, null, v.caption, v.media::jsonb
from (values
  (1, 'voce-sabia-feed', 'feed', 'Quatro coisas que o EAFIT faz e muita gente ainda não sabe. 👀
Salve este post e mande para quem treina com você.

Comece agora. Link na bio 👇

#personaltrainer #treino #appdetreino #academia #musculacao', '[{"type":"image","url":"https://eafit.com.br/img/marketing/voce-sabia-1.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/voce-sabia-2.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/voce-sabia-3.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/voce-sabia-4.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/voce-sabia-5.jpg"},{"type":"image","url":"https://eafit.com.br/img/marketing/voce-sabia-6.jpg"}]')
) as v(n, key, format, caption, media)
on conflict (key) do nothing;
