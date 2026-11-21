-- Marketing do Run: o Reel "Conte os dias até a corrida" (embreve-corrida-sua-prova-reel) fica de fora.
-- Pulado enquanto não foi publicado; com isso não há mais Reel "Em breve" na fila antes do lançamento.
update public.marketing_autopost_queue
set skipped_at = now()
where key = 'embreve-corrida-sua-prova-reel'
  and posted_at is null
  and skipped_at is null;
