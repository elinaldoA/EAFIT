-- Calorias e macros do dia na mesma linha do registro de proteína: uma linha
-- por usuário e dia, então exportação, exclusão de conta e relatórios seguem
-- valendo sem tabela nova. Linhas antigas ficam com 0 nas colunas novas.
alter table public.protein_logs
  add column if not exists kcal integer not null default 0 check (kcal >= 0),
  add column if not exists carbs_g integer not null default 0 check (carbs_g >= 0),
  add column if not exists fat_g integer not null default 0 check (fat_g >= 0);
