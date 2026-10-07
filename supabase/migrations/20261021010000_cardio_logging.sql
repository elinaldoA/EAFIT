-- Registro de cardio: itens do plano sem séries (esteira, corrida, bike...)
-- passam a guardar duração e distância na mesma linha de exercise_sets
-- (set_number = 1), reaproveitando sync offline, RLS e histórico. carga/reps
-- ficam nulos nesses itens, então PRs e volume não são afetados.
alter table public.exercise_sets
  add column if not exists duracao_min numeric check (duracao_min is null or (duracao_min >= 0 and duracao_min <= 1440)),
  add column if not exists distancia_km numeric check (distancia_km is null or (distancia_km >= 0 and distancia_km <= 1000));
