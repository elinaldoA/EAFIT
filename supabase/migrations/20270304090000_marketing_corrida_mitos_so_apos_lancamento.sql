-- Marketing do Run: o conteúdo "Mitos e verdades da corrida" só sai depois do lançamento.
-- As versões "Em breve" (feed, Reel e story) ainda não publicadas são puladas; as versões pós-lançamento
-- (corrida-edu-mitos-pos-feed e corrida-edu-mitos-pos-reel, requires_module = 'corrida') seguem na fila.
update public.marketing_autopost_queue
set skipped_at = now()
where key in ('corrida-edu-mitos-feed', 'corrida-edu-mitos-reel', 'corrida-edu-mitos-story')
  and posted_at is null
  and skipped_at is null;
