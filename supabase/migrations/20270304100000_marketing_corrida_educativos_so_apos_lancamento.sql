-- Marketing do Run: todo o conteúdo educativo (corrida-edu-*) só sai depois do lançamento.
-- As versões "Em breve" (hide_when_module = 'corrida') ainda não publicadas são puladas; as versões
-- pós-lançamento (corrida-edu-*-pos-*, requires_module = 'corrida') seguem na fila e só saem com o módulo ligado.
-- Antes do lançamento ficam apenas as peças embreve-corrida-*.
update public.marketing_autopost_queue
set skipped_at = now()
where key like 'corrida-edu-%'
  and hide_when_module = 'corrida'
  and requires_module is null
  and posted_at is null
  and skipped_at is null;
