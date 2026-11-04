-- Marketing: tira da fila os Reels com personagem ilustrado (não ficaram bons).
-- Só remove o que ainda não foi publicado; o que já saiu se apaga pelo painel.
delete from public.marketing_autopost_queue
where key in ('persona-ela-reel', 'persona-ele-reel') and posted_at is null;
