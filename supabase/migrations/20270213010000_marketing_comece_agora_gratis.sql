-- Textos de marketing: a chamada final das legendas passa a dizer
-- 'Comece agora grátis. Link na bio'. Troca só o que ainda não foi publicado:
-- itens da fila da publicação automática e posts sem nenhum destino publicado
-- ou em publicação.
update public.marketing_autopost_queue
set caption = replace(caption, 'Link na bio 👇', 'Comece agora grátis. Link na bio 👇')
where caption like '%Link na bio 👇%' and caption not like '%Comece agora grátis%';

update public.marketing_posts p
set caption = replace(p.caption, 'Link na bio 👇', 'Comece agora grátis. Link na bio 👇')
where p.caption like '%Link na bio 👇%' and p.caption not like '%Comece agora grátis%'
  and not exists (
    select 1 from public.marketing_post_targets t
    where t.post_id = p.id and t.status in ('published', 'processing')
  );
