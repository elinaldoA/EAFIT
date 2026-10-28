-- Dashboard → Localização: a comparação com o período anterior passa a vir
-- também por cidade (seta de variação na tabela de cidades). Mesmo recorte de
-- 20261125010000_geo_panel_compare.sql, com region e city a mais no retorno.

drop function if exists public.admin_geo_period_compare(int);

create function public.admin_geo_period_compare(days_back int default 30)
returns table (page text, country text, uf text, region text, city text, cur bigint, prev bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := greatest(1, least(coalesce(days_back, 30), 366));
  since date := (now() at time zone 'America/Sao_Paulo')::date - (n - 1);
  prev_since date := since - n;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with acc as (
      select v.page, v.country, v.uf, v.region, v.city, v.visited_on as day
      from public.page_visits v
      where v.visited_on >= prev_since and v.country is not null
      union all
      select 'app'::text, d.country, d.uf, d.region, d.city, d.day
      from public.app_access_days d
      left join public.profiles p on p.id = d.user_id
      where d.day >= prev_since and d.country is not null and not coalesce(p.is_admin, false)
    )
    select a.page, a.country, a.uf, a.region, a.city,
           count(*) filter (where a.day >= since)::bigint,
           count(*) filter (where a.day < since)::bigint
    from acc a
    group by 1, 2, 3, 4, 5;
end;
$$;

revoke execute on function public.admin_geo_period_compare(int) from public, anon;
grant execute on function public.admin_geo_period_compare(int) to authenticated;
