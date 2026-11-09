-- Dieta importada pelo aluno na aba Nutricao (texto colado ou arquivo): um plano
-- por usuario, guardado como lista de refeicoes com os itens e macros de cada
-- uma. O aluno registra cada refeicao do plano no dia com um toque; as metas
-- continuam as da formula.
create table if not exists public.nutrition_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  meals jsonb not null default '[]'::jsonb
    check (jsonb_typeof(meals) = 'array' and jsonb_array_length(meals) <= 12 and pg_column_size(meals) <= 60000),
  updated_at timestamptz not null default now()
);

alter table public.nutrition_plans enable row level security;

drop policy if exists "own nutrition_plans" on public.nutrition_plans;
create policy "own nutrition_plans" on public.nutrition_plans
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "admin full access" on public.nutrition_plans;
create policy "admin full access" on public.nutrition_plans
  for all using (public.is_admin()) with check (public.is_admin());
