-- Nota curta por exercício ("banco na posição 4", "ombro incomodou"): fica
-- guardada por usuário e nome do exercício e reaparece em toda sessão seguinte.
create table if not exists public.exercise_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_name text not null,
  note text not null check (char_length(note) <= 280),
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_name)
);

alter table public.exercise_notes enable row level security;

drop policy if exists "own exercise_notes" on public.exercise_notes;
create policy "own exercise_notes" on public.exercise_notes
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
