-- Dashboard → Localização: comparação com o período anterior também para
-- contas (modo Contas e Conversão). Conta quantas contas distintas usaram o
-- app em cada janela, por lugar, a partir de app_access_days (1 linha por conta
-- por dia, com o lugar daquele dia). user_client só guarda o último acesso, então
-- não serve para olhar o período anterior.
-- Sem contas de admin, como o resto do painel.

create or replace function public.admin_user_geo_compare(days_back int default 30)
returns table (country text, uf text, region text, city text, cur bigint, prev bigint)
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
    with per as (
      select d.user_id, d.country, d.uf, d.region, d.city,
             bool_or(d.day >= since) as in_cur,
             bool_or(d.day < since) as in_prev
      from public.app_access_days d
      left join public.profiles p on p.id = d.user_id
      where d.day >= prev_since and d.country is not null and not coalesce(p.is_admin, false)
      group by d.user_id, d.country, d.uf, d.region, d.city
    )
    select x.country, x.uf, x.region, x.city,
           count(*) filter (where x.in_cur)::bigint,
           count(*) filter (where x.in_prev)::bigint
    from per x
    group by 1, 2, 3, 4;
end;
$$;

revoke execute on function public.admin_user_geo_compare(int) from public, anon;
grant execute on function public.admin_user_geo_compare(int) to authenticated;
