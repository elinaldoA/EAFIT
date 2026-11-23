-- Músculo principal de exercícios fora da biblioteca (criados pela pessoa ou
-- pelo personal), para o volume semanal por músculo. Guardado por usuário e
-- nome do exercício; vale no lugar das palavras-chave do nome.
create table if not exists public.exercise_muscles (
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_name text not null,
  muscle text not null check (muscle in ('chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'abs')),
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_name)
);

alter table public.exercise_muscles enable row level security;

drop policy if exists "own exercise_muscles" on public.exercise_muscles;
create policy "own exercise_muscles" on public.exercise_muscles
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
