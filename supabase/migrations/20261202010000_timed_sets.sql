-- Séries por tempo (prancha, hollow hold, L-sit, farmer walk...): o plano traz
-- as repetições em segundos ('40s', '30s cada lado') e o app passa a registrar
-- a duração de cada série na coluna nova, em vez de forçar "reps". Mesmo
-- padrão do cardio (20261021010000_cardio_logging.sql): reaproveita sync
-- offline, RLS e histórico. `reps` fica nulo nesses itens, então volume, PRs e
-- sugestões de carga (que exigem reps > 0) não são afetados; `carga` continua
-- opcional pra isometria com peso.
alter table public.exercise_sets
  add column if not exists duracao_s numeric check (duracao_s is null or (duracao_s >= 0 and duracao_s <= 3600));
