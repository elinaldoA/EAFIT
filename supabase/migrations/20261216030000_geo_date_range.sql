-- Dashboard → Localização: período por datas (ex.: "mês passado"). As consultas
-- que olham acessos dia a dia ganham `end_day` (último dia da janela, padrão =
-- hoje em Brasília, nunca no futuro): a janela passa a ser
-- [end_day - (days_back - 1), end_day], e a comparação usa a janela de mesmo
-- tamanho logo antes dela.
--
-- Ficam de fora (só valem até hoje): admin_user_geo, admin_user_geo_retention e
-- admin_user_geo_compare — olham o último acesso de cada conta (user_client),
-- que não dá pra reconstruir para um período já passado.
--
-- A assinatura antiga (só days_back) é removida pra não ficar ambígua com a nova
-- (os dois parâmetros têm padrão). Quem chamar só com days_back continua igual.

drop function if exists public.admin_visit_geo(int);
drop function if exists public.admin_app_geo(int);
drop function if exists public.admin_geo_period_compare(int);
drop function if exists public.admin_geo_daily(int);
drop function if exists public.admin_geo_audience(int);
drop function if exists public.admin_geo_hours(int);

create function public.admin_visit_geo(days_back int default 30, end_day date default null)
returns table (page text, status text, country text, uf text, region text, city text, visits bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  last_day date := least(coalesce(end_day, (now() at time zone 'America/Sao_Paulo')::date), (now() at time zone 'America/Sao_Paulo')::date);
  since date := case when days_back is null or days_back <= 0 then null else last_day - (days_back - 1) end;
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
    where (since is null or v.visited_on >= since) and v.visited_on <= last_day
    group by 1, 2, 3, 4, 5, 6;
end;
$$;

create function public.admin_app_geo(days_back int default 30, end_day date default null)
returns table (page text, status text, country text, uf text, region text, city text, visits bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  last_day date := least(coalesce(end_day, (now() at time zone 'America/Sao_Paulo')::date), (now() at time zone 'America/Sao_Paulo')::date);
  since date := case when days_back is null or days_back <= 0 then null else last_day - (days_back - 1) end;
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
    where (since is null or d.day >= since) and d.day <= last_day and not coalesce(p.is_admin, false)
    group by 2, 3, 4, 5, 6;
end;
$$;

create function public.admin_geo_period_compare(days_back int default 30, end_day date default null)
returns table (page text, country text, uf text, region text, city text, cur bigint, prev bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := greatest(1, least(coalesce(days_back, 30), 366));
  last_day date := least(coalesce(end_day, (now() at time zone 'America/Sao_Paulo')::date), (now() at time zone 'America/Sao_Paulo')::date);
  since date := last_day - (n - 1);
  prev_since date := since - n;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with acc as (
      select v.page, v.country, v.uf, v.region, v.city, v.visited_on as day
      from public.page_visits v
      where v.visited_on >= prev_since and v.visited_on <= last_day and v.country is not null
      union all
      select 'app'::text, d.country, d.uf, d.region, d.city, d.day
      from public.app_access_days d
      left join public.profiles p on p.id = d.user_id
      where d.day >= prev_since and d.day <= last_day and d.country is not null and not coalesce(p.is_admin, false)
    )
    select a.page, a.country, a.uf, a.region, a.city,
           count(*) filter (where a.day >= since)::bigint,
           count(*) filter (where a.day < since)::bigint
    from acc a
    group by 1, 2, 3, 4, 5;
end;
$$;

create function public.admin_geo_daily(days_back int default 30, end_day date default null)
returns table (day date, page text, country text, uf text, total bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := greatest(1, least(coalesce(days_back, 30), 366));
  last_day date := least(coalesce(end_day, (now() at time zone 'America/Sao_Paulo')::date), (now() at time zone 'America/Sao_Paulo')::date);
  since date := last_day - (n - 1);
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with acc as (
      select v.visited_on as d, v.page, v.country, v.uf
      from public.page_visits v
      where v.visited_on >= since and v.visited_on <= last_day and v.country is not null
      union all
      select a.day, 'app'::text, a.country, a.uf
      from public.app_access_days a
      left join public.profiles p on p.id = a.user_id
      where a.day >= since and a.day <= last_day and a.country is not null and not coalesce(p.is_admin, false)
    )
    select c.d, c.page, c.country, c.uf, count(*)::bigint
    from acc c
    group by 1, 2, 3, 4;
end;
$$;

create function public.admin_geo_audience(days_back int default 30, end_day date default null)
returns table (page text, country text, uf text, source text, device text, total bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := greatest(1, least(coalesce(days_back, 30), 366));
  last_day date := least(coalesce(end_day, (now() at time zone 'America/Sao_Paulo')::date), (now() at time zone 'America/Sao_Paulo')::date);
  since date := last_day - (n - 1);
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select v.page, v.country, v.uf, v.source, v.device, count(*)::bigint
    from public.page_visits v
    where v.visited_on >= since and v.visited_on <= last_day and v.country is not null
    group by 1, 2, 3, 4, 5;
end;
$$;

create function public.admin_geo_hours(days_back int default 30, end_day date default null)
returns table (hour int, page text, country text, uf text, total bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := greatest(1, least(coalesce(days_back, 30), 366));
  last_day date := least(coalesce(end_day, (now() at time zone 'America/Sao_Paulo')::date), (now() at time zone 'America/Sao_Paulo')::date);
  since date := last_day - (n - 1);
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with acc as (
      select extract(hour from v.created_at at time zone 'America/Sao_Paulo')::int as h, v.page, v.country, v.uf
      from public.page_visits v
      where v.visited_on >= since and v.visited_on <= last_day and v.country is not null
      union all
      select extract(hour from a.created_at at time zone 'America/Sao_Paulo')::int, 'app'::text, a.country, a.uf
      from public.app_access_days a
      left join public.profiles p on p.id = a.user_id
      where a.day >= since and a.day <= last_day and a.country is not null and not coalesce(p.is_admin, false)
    )
    select c.h, c.page, c.country, c.uf, count(*)::bigint
    from acc c
    group by 1, 2, 3, 4;
end;
$$;

revoke execute on function public.admin_visit_geo(int, date) from public, anon;
revoke execute on function public.admin_app_geo(int, date) from public, anon;
revoke execute on function public.admin_geo_period_compare(int, date) from public, anon;
revoke execute on function public.admin_geo_daily(int, date) from public, anon;
revoke execute on function public.admin_geo_audience(int, date) from public, anon;
revoke execute on function public.admin_geo_hours(int, date) from public, anon;
grant execute on function public.admin_visit_geo(int, date) to authenticated;
grant execute on function public.admin_app_geo(int, date) to authenticated;
grant execute on function public.admin_geo_period_compare(int, date) to authenticated;
grant execute on function public.admin_geo_daily(int, date) to authenticated;
grant execute on function public.admin_geo_audience(int, date) to authenticated;
grant execute on function public.admin_geo_hours(int, date) to authenticated;
