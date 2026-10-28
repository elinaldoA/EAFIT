-- Dashboard → Localização: evolução diária dos acessos localizados (gráfico por
-- dia, do Brasil/mundo todo ou de um estado/país). Mesmo recorte de
-- admin_geo_period_compare: site, tela de acesso e app, sem contas de admin.

create or replace function public.admin_geo_daily(days_back int default 30)
returns table (day date, page text, country text, uf text, total bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := greatest(1, least(coalesce(days_back, 30), 366));
  since date := (now() at time zone 'America/Sao_Paulo')::date - (n - 1);
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with acc as (
      select v.visited_on as d, v.page, v.country, v.uf
      from public.page_visits v
      where v.visited_on >= since and v.country is not null
      union all
      select a.day, 'app'::text, a.country, a.uf
      from public.app_access_days a
      left join public.profiles p on p.id = a.user_id
      where a.day >= since and a.country is not null and not coalesce(p.is_admin, false)
    )
    select c.d, c.page, c.country, c.uf, count(*)::bigint
    from acc c
    group by 1, 2, 3, 4;
end;
$$;

revoke execute on function public.admin_geo_daily(int) from public, anon;
grant execute on function public.admin_geo_daily(int) to authenticated;
