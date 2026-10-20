-- Dashboard → Localização: correção do status "pendente" e comparação com o
-- período anterior. Complementa 20261105010000_visit_geo.sql e
-- 20261106010000_app_access_geo.sql.
--
-- 1. geo_pending abandona visitas e dias de uso com mais de 7 dias na fila,
--    mas admin_visit_geo/admin_app_geo continuavam mostrando essas linhas como
--    "pendente" até o IP ser apagado (90 dias). Agora viram "sem_local".
-- 2. admin_geo_period_compare: acessos localizados por página/país/estado no
--    período e no período anterior de mesmo tamanho, pra seta de variação.

create or replace function public.admin_visit_geo(days_back int default 30)
returns table (page text, status text, country text, uf text, region text, city text, visits bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  since date := case when days_back is null or days_back <= 0 then null
                     else (now() at time zone 'America/Sao_Paulo')::date - (days_back - 1) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select v.page,
           case when v.country is not null then 'ok'
                when v.geo_at is null and v.ip is not null
                     and v.created_at > now() - interval '7 days' then 'pendente'
                else 'sem_local' end,
           v.country, v.uf, v.region, v.city, count(*)::bigint
    from public.page_visits v
    where since is null or v.visited_on >= since
    group by 1, 2, 3, 4, 5, 6;
end;
$$;

grant execute on function public.admin_visit_geo(int) to authenticated;

create or replace function public.admin_app_geo(days_back int default 30)
returns table (page text, status text, country text, uf text, region text, city text, visits bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  since date := case when days_back is null or days_back <= 0 then null
                     else (now() at time zone 'America/Sao_Paulo')::date - (days_back - 1) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select 'app'::text,
           case when d.country is not null then 'ok'
                when d.geo_at is null and d.ip is not null
                     and d.created_at > now() - interval '7 days' then 'pendente'
                else 'sem_local' end,
           d.country, d.uf, d.region, d.city, count(*)::bigint
    from public.app_access_days d
    left join public.profiles p on p.id = d.user_id
    where (since is null or d.day >= since) and not coalesce(p.is_admin, false)
    group by 2, 3, 4, 5, 6;
end;
$$;

grant execute on function public.admin_app_geo(int) to authenticated;

-- Acessos localizados (site, tela de acesso e app) no período atual (cur) e no
-- anterior de mesmo tamanho (prev). Mesmo recorte de admin_visit_geo e
-- admin_app_geo; o painel filtra pelas páginas do modo e soma.
create or replace function public.admin_geo_period_compare(days_back int default 30)
returns table (page text, country text, uf text, cur bigint, prev bigint)
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
      select v.page, v.country, v.uf, v.visited_on as day
      from public.page_visits v
      where v.visited_on >= prev_since and v.country is not null
      union all
      select 'app'::text, d.country, d.uf, d.day
      from public.app_access_days d
      left join public.profiles p on p.id = d.user_id
      where d.day >= prev_since and d.country is not null and not coalesce(p.is_admin, false)
    )
    select a.page, a.country, a.uf,
           count(*) filter (where a.day >= since)::bigint,
           count(*) filter (where a.day < since)::bigint
    from acc a
    group by 1, 2, 3;
end;
$$;

revoke execute on function public.admin_geo_period_compare(int) from public, anon;
grant execute on function public.admin_geo_period_compare(int) to authenticated;
