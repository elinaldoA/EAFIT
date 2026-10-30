-- Ceia como refeição do diário (depois do jantar). O check de meal veio inline
-- na criação da tabela, então o nome é o gerado pelo Postgres; procura pelo
-- conteúdo em vez de confiar nele.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.nutrition_entries'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%meal%'
  loop
    execute format('alter table public.nutrition_entries drop constraint %I', c);
  end loop;
end $$;

alter table public.nutrition_entries
  add constraint nutrition_entries_meal_check
  check (meal in ('cafe', 'almoco', 'lanche', 'jantar', 'ceia', 'outro'));
