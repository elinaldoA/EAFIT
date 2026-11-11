-- O app vai ser monetizado em breve: some o 'grátis' dos textos.
-- 1) Conteúdo da landing guardado no banco (editado no painel admin).
-- 2) Legendas de marketing que ainda não foram publicadas.
-- Idempotente: rodar de novo não muda nada.

update public.landing_content
set content = replace(replace(replace(replace(replace(replace(replace(replace(replace(content::text,
    'Grátis · sem anúncios · funciona offline', 'Comece agora · sem anúncios · funciona offline'),
    'Grátis · instalável · funciona offline', 'Comece agora · instalável · funciona offline'),
    'Começar grátis', 'Começar agora'),
    'Abrir o app grátis', 'Abrir o app agora'),
    'Grátis e sem anúncios', 'Sem anúncios'),
    '100% grátis', 'Sem anúncios'),
    'É grátis mesmo?', 'Quanto custa?'),
    'Sim. Não tem plano pago, não tem anúncio e não pede cartão de crédito.',
    'Você pode criar a conta e começar a usar agora, sem cartão de crédito. Se algum recurso passar a ser pago, avisamos antes.'),
    'Grátis, sem anúncios', 'Comece agora, sem anúncios')::jsonb,
  updated_at = now()
where content::text ~ 'Grátis|grátis|gratuito';

-- Legendas: 'Link na bio' sem 'grátis' (corrige também a migration 20270213010000,
-- que acrescentava 'Comece agora grátis.'). Só o que ainda não foi publicado.
update public.marketing_autopost_queue
set caption = replace(caption, 'Comece agora grátis. Link na bio', 'Comece agora. Link na bio')
where caption like '%Comece agora grátis. Link na bio%';
update public.marketing_autopost_queue
set caption = replace(caption, 'Link na bio 👇', 'Comece agora. Link na bio 👇')
where caption like '%Link na bio 👇%' and caption not like '%Comece agora%';

update public.marketing_posts p
set caption = replace(p.caption, 'Comece agora grátis. Link na bio', 'Comece agora. Link na bio')
where p.caption like '%Comece agora grátis. Link na bio%'
  and not exists (select 1 from public.marketing_post_targets t where t.post_id = p.id and t.status in ('published', 'processing'));
update public.marketing_posts p
set caption = replace(p.caption, 'Link na bio 👇', 'Comece agora. Link na bio 👇')
where p.caption like '%Link na bio 👇%' and p.caption not like '%Comece agora%'
  and not exists (select 1 from public.marketing_post_targets t where t.post_id = p.id and t.status in ('published', 'processing'));
