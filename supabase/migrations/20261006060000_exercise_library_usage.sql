-- Uso de cada exercício da biblioteca, para a tela "Biblioteca de exercícios"
-- do painel: em quantos planos aparece e quantos relatos de dor forte/lesão
-- existem. Serve de aviso antes de renomear ou excluir (histórico e recordes
-- dos usuários são agrupados pelo NOME do exercício) e para achar exercícios
-- que machucam gente.
--
-- Admins ficam de fora (contas de teste/operação). Em funções com RETURNS
-- TABLE as colunas de saída viram variáveis plpgsql: colunas de tabela são
-- sempre qualificadas com alias.
create or replace function public.admin_exercise_usage()
returns table (nome text, plans_count bigint, discomfort_count bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with plans as (
      select pe.nome as exercise, count(*) as n
      from public.plan_exercises pe
      join public.plan_days pd on pd.id = pe.plan_day_id
      join public.workout_plans wp on wp.id = pd.plan_id
      where not exists (select 1 from public.profiles p where p.id = wp.user_id and p.is_admin)
      group by pe.nome
    ),
    pain as (
      select d.exercise_name as exercise, count(*) as n
      from public.exercise_discomfort d
      where d.severity in ('forte', 'lesao')
        and not exists (select 1 from public.profiles p where p.id = d.user_id and p.is_admin)
      group by d.exercise_name
    )
    select coalesce(a.exercise, b.exercise), coalesce(a.n, 0)::bigint, coalesce(b.n, 0)::bigint
    from plans a
    full join pain b on b.exercise = a.exercise;
end;
$$;

grant execute on function public.admin_exercise_usage() to authenticated;
