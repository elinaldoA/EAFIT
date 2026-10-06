-- Landing: totais públicos (só contagens agregadas) para a faixa de números.
-- security definer porque anon não lê profiles/workouts/exercise_sets (RLS);
-- a função devolve apenas três inteiros, nunca linhas nem identificadores.

create or replace function public.landing_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'users',    (select count(*) from public.profiles),
    'workouts', (select count(*) from public.workouts where completed),
    'sets',     (select count(*) from public.exercise_sets where completed)
  );
$$;

revoke all on function public.landing_stats() from public;
grant execute on function public.landing_stats() to anon, authenticated;
