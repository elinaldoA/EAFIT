-- Marketing: o autopost parou porque o foco total (focus_module = 'corrida') deixou a fila sem item elegível:
-- os stories "Em breve" já saíram ou estavam pulados e os de lançamento só saem com o módulo ligado.
-- Reativa os 8 stories de suspense do Run (s03 a s10) que foram pulados em lote em 23/11, para o foco
-- seguir nos stories do Run até o lançamento (1º de dezembro).
update public.marketing_autopost_queue
set skipped_at = null
where key in (
  'suspense-corrida-s03-story', 'suspense-corrida-s04-story', 'suspense-corrida-s05-story', 'suspense-corrida-s06-story',
  'suspense-corrida-s07-story', 'suspense-corrida-s08-story', 'suspense-corrida-s09-story', 'suspense-corrida-s10-story'
)
  and posted_at is null
  and skipped_at is not null;
