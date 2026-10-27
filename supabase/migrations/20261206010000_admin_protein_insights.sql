-- Painel admin: proteína registrada (protein_logs) na tela Bem-estar, ao lado
-- da hidratação. Funções novas — as de bem-estar existentes não mudam, porque
-- alterar as colunas de saída de uma função exige apagá-la antes.
--
-- Sem contas de admin, como nas demais análises. `days_back` nulo ou <= 0 =
-- todo o histórico, exceto na série por dia, limitada a 180 dias.

-- Meta diária de proteína em g, pela mesma regra do app
-- (computeNutritionGoals em app-react/src/lib/nutritionGoals.js): peso x g/kg
-- da meta principal, só com sexo, idade, peso e altura válidos no perfil.
-- Sem esses dados devolve null (a pessoa não tem meta e fica fora do "na meta").
-- Os números são lidos em uma subconsulta antes das comparações, porque o
-- Postgres não garante a ordem de avaliação do AND (um cast em texto inválido
-- derrubaria a consulta).
create or replace function public.admin_protein_goal_g(md jsonb)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when md->>'sexo' in ('M', 'F')
         and g.age between 14 and 100
         and g.kg between 30 and 300
         and g.cm between 100 and 250
    then round(g.kg * case md->>'meta'
      when 'massa' then 2.0
      when 'forca' then 1.8
      when 'emagrecer' then 2.0
      when 'definicao' then 2.2
      when 'resistencia' then 1.5
      else 1.4
    end)
  end
  from (
    select
      case when (md->>'idade') ~ '^\d+(\.\d+)?$' then (md->>'idade')::numeric end as age,
      case when (md->>'peso') ~ '^\d+(\.\d+)?$' then (md->>'peso')::numeric end as kg,
      case when (md->>'altura') ~ '^\d+(\.\d+)?$' then (md->>'altura')::numeric end as cm
  ) g;
$$;

revoke execute on function public.admin_protein_goal_g(jsonb) from public, anon, authenticated;

-- Resumo do período. po_goal_days = dias registrados por quem tem meta (a base
-- do "bateu a meta"); po_hit_days = os que chegaram na meta.
create or replace function public.admin_protein_overview(days_back int default 30)
returns table (
  po_users bigint,
  po_protein_users bigint, po_protein_days bigint, po_protein_avg_g numeric,
  po_goal_days bigint, po_hit_days bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  since date := case when days_back is null or days_back <= 0 then null
                     else (now() at time zone 'America/Sao_Paulo')::date - (days_back - 1) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with nonadmin as (
      select u.id as uid, u.raw_user_meta_data as md
      from auth.users u
      left join public.profiles p on p.id = u.id
      where not coalesce(p.is_admin, false)
    ),
    pt as (
      select l.user_id as uid, l.amount_g as g, public.admin_protein_goal_g(n.md) as goal
      from public.protein_logs l
      join nonadmin n on n.uid = l.user_id
      where l.amount_g > 0 and (since is null or l.log_date >= since)
    )
    select
      (select count(*) from nonadmin),
      (select count(distinct pt.uid) from pt),
      (select count(*) from pt),
      (select round(avg(pt.g)) from pt),
      (select count(*) from pt where pt.goal is not null),
      (select count(*) from pt where pt.goal is not null and pt.g >= pt.goal);
end;
$$;

-- Série diária (até 180 dias): quem registrou, a média e quantos bateram a meta.
create or replace function public.admin_protein_by_day(days_back int default 30)
returns table (
  pd_day date, pd_users bigint, pd_avg_g numeric, pd_hits bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  n int := least(greatest(coalesce(days_back, 30), 1), 180);
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with nonadmin as (
      select u.id as uid, u.raw_user_meta_data as md
      from auth.users u
      left join public.profiles p on p.id = u.id
      where not coalesce(p.is_admin, false)
    ),
    days as (
      select g::date as d from generate_series(today - (n - 1), today, interval '1 day') g
    ),
    pt as (
      select l.log_date as d, count(*) as total, round(avg(l.amount_g)) as avg_g,
             count(*) filter (where l.amount_g >= public.admin_protein_goal_g(na.md)) as hits
      from public.protein_logs l
      join nonadmin na on na.uid = l.user_id
      where l.amount_g > 0 and l.log_date >= today - (n - 1)
      group by l.log_date
    )
    select days.d, coalesce(pt.total, 0)::bigint, pt.avg_g, coalesce(pt.hits, 0)::bigint
    from days
    left join pt on pt.d = days.d
    order by days.d;
end;
$$;
