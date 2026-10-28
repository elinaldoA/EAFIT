-- Dashboard → Localização: horário dos acessos localizados (gráfico "Por
-- horário"), em hora de Brasília. No app, conta o primeiro acesso de cada dia.

create or replace function public.admin_geo_hours(days_back int default 30)
returns table (hour int, page text, country text, uf text, total bigint)
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
      select extract(hour from v.created_at at time zone 'America/Sao_Paulo')::int as h, v.page, v.country, v.uf
      from public.page_visits v
      where v.visited_on >= since and v.country is not null
      union all
      select extract(hour from a.created_at at time zone 'America/Sao_Paulo')::int, 'app'::text, a.country, a.uf
      from public.app_access_days a
      left join public.profiles p on p.id = a.user_id
      where a.day >= since and a.country is not null and not coalesce(p.is_admin, false)
    )
    select c.h, c.page, c.country, c.uf, count(*)::bigint
    from acc c
    group by 1, 2, 3, 4;
end;
$$;

revoke execute on function public.admin_geo_hours(int) from public, anon;
grant execute on function public.admin_geo_hours(int) to authenticated;
