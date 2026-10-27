-- Painel admin: calorias registradas (protein_logs.kcal) na tela Bem-estar.
-- Função nova, como as de proteína: as existentes não mudam. Sem contas de
-- admin; `days_back` nulo ou <= 0 = todo o histórico.
create or replace function public.admin_kcal_overview(days_back int default 30)
returns table (
  ko_users bigint, ko_days bigint, ko_avg_kcal numeric
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
      select u.id as uid
      from auth.users u
      left join public.profiles p on p.id = u.id
      where not coalesce(p.is_admin, false)
    ),
    kt as (
      select l.user_id as uid, l.kcal as k
      from public.protein_logs l
      join nonadmin n on n.uid = l.user_id
      where l.kcal > 0 and (since is null or l.log_date >= since)
    )
    select
      (select count(distinct kt.uid) from kt),
      (select count(*) from kt),
      (select round(avg(kt.k)) from kt);
end;
$$;
