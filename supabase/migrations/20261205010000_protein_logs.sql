-- Registro diário de proteína (g) — espelha water_logs: uma linha por usuário
-- e dia, gravada por upsert. A meta é calculada no app a partir do Perfil.
create table if not exists public.protein_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  amount_g integer not null default 0 check (amount_g >= 0),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

alter table public.protein_logs enable row level security;

drop policy if exists "own protein_logs" on public.protein_logs;
create policy "own protein_logs" on public.protein_logs
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "admin full access" on public.protein_logs;
create policy "admin full access" on public.protein_logs
  for all using (public.is_admin()) with check (public.is_admin());
