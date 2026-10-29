-- Fibra e sódio no diário por refeição. Ficam vazios (null) quando o alimento
-- não traz o dado (atalhos, valores digitados à mão), para a tela não somar
-- zero como se fosse medido. Os totais do dia continuam só em protein_logs.
alter table public.nutrition_entries
  add column if not exists fiber_g numeric(5,1) check (fiber_g between 0 and 1000),
  add column if not exists sodium_mg integer check (sodium_mg between 0 and 100000);
