-- Sincronização diária das provas (app-admin/scripts/run-events-import.mjs).
--
-- last_seen_at: última importação em que a prova ainda estava no calendário de
-- origem. missed_runs: importações seguidas em que ela sumiu; ao chegar a 2 o
-- script devolve a prova para rascunho (saiu do app até o admin rever).
-- O índice único passa a ser total (e não parcial); linhas manuais têm
-- source_id nulo e nulos nunca colidem entre si.
alter table public.run_events add column if not exists last_seen_at timestamptz;
alter table public.run_events add column if not exists missed_runs integer not null default 0 check (missed_runs >= 0);

drop index if exists public.run_events_source_key;
create unique index if not exists run_events_source_key on public.run_events (source, source_id);
