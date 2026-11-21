-- Marketing do Run: manter o suspense até o lançamento. As peças "Em breve" que ainda não saíram mostram
-- telas e funções do módulo (provas, contagem de dias, cartão, tênis, clima, desafios, ranking, mapa, ritmo, 10K).
-- Ficam todas puladas; só saem de novo se alguém limpar skipped_at. Antes do lançamento só entra peça de suspense
-- (sem funcionalidades). As peças de lançamento e pós-lançamento (requires_module) seguem na fila.
update public.marketing_autopost_queue
set skipped_at = now()
where hide_when_module = 'corrida'
  and requires_module is null
  and posted_at is null
  and skipped_at is null;
