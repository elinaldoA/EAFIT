-- Pageviews das páginas do site (como-funciona, recursos, personal, sobre…) e
-- utm_medium / utm_content nas visitas.
--
-- Até aqui page_visits só aceitava 'landing' e 'acesso', 1 por dia por
-- navegador: as demais páginas do site não apareciam em lugar nenhum. Elas vão
-- numa tabela própria (e não em page_visits) pra não inflar o funil da landing
-- nem as telas de origem/geo, que contam visitas por page.
--
-- Mesma filosofia das outras tabelas anônimas: sem IP, user-agent ou cookie;
-- só dia, página, origem e o identificador do navegador (eafit_device_id).
-- O site deduplica por sessão do navegador (1 registro por página por sessão).

-- ---------------------------------------------------------------------------
-- 1. site_pageviews
-- ---------------------------------------------------------------------------
create table if not exists public.site_pageviews (
  id bigint generated always as identity primary key,
  visited_on date not null default (now() at time zone 'America/Sao_Paulo')::date,
  path text not null check (path ~ '^[a-z0-9_/-]{1,60}$'),
  source text not null default 'direto' check (source ~ '^[a-z0-9_-]{1,40}$'),
  campaign text not null default '' check (campaign ~ '^[a-z0-9_-]{0,40}$'),
  device text not null default '' check (device in ('', 'celular', 'tablet', 'desktop')),
  visitor_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists site_pageviews_visited_on_idx on public.site_pageviews (visited_on);

alter table public.site_pageviews enable row level security;

drop policy if exists "anyone can record a pageview" on public.site_pageviews;
create policy "anyone can record a pageview" on public.site_pageviews
  for insert to anon, authenticated
  with check (visited_on = (now() at time zone 'America/Sao_Paulo')::date);

drop policy if exists "admin reads pageviews" on public.site_pageviews;
create policy "admin reads pageviews" on public.site_pageviews
  for select using (public.is_admin());

revoke all on public.site_pageviews from anon, authenticated;
grant insert (path, source, campaign, device, visitor_id) on public.site_pageviews to anon, authenticated;

drop trigger if exists site_pageviews_daily_cap on public.site_pageviews;
create trigger site_pageviews_daily_cap
  before insert on public.site_pageviews
  for each row execute function public.enforce_daily_insert_cap(30000);

-- ---------------------------------------------------------------------------
-- 2. utm_medium e utm_content nas visitas
-- ---------------------------------------------------------------------------
alter table public.page_visits add column if not exists medium text not null default '';
alter table public.page_visits add column if not exists content text not null default '';

alter table public.page_visits drop constraint if exists page_visits_medium_check;
alter table public.page_visits add constraint page_visits_medium_check check (medium ~ '^[a-z0-9_-]{0,40}$');
alter table public.page_visits drop constraint if exists page_visits_content_check;
alter table public.page_visits add constraint page_visits_content_check check (content ~ '^[a-z0-9_-]{0,40}$');

grant insert (page, source, os, browser, device, lang, campaign, ref, personal, visitor_id, medium, content)
  on public.page_visits to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Painel
-- ---------------------------------------------------------------------------
-- Páginas do site mais vistas: acessos (pageviews) e navegadores distintos.
create or replace function public.admin_site_pages(days_back int default 30)
returns table (path text, views bigint, visitors bigint)
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
    select p.path, count(*)::bigint, count(distinct p.visitor_id)::bigint
    from public.site_pageviews p
    where since is null or p.visited_on >= since
    group by p.path
    order by count(*) desc, p.path;
end;
$$;

grant execute on function public.admin_site_pages(int) to authenticated;

-- Campanha × criativo: utm_campaign, utm_medium e utm_content das visitas.
-- Linhas sem nenhum dos três ficam de fora (visita sem link marcado).
create or replace function public.admin_utm_breakdown(days_back int default 30)
returns table (campaign text, medium text, content text, visits bigint)
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
    select v.campaign, v.medium, v.content, count(*)::bigint
    from public.page_visits v
    where (since is null or v.visited_on >= since)
      and (v.campaign <> '' or v.medium <> '' or v.content <> '')
    group by v.campaign, v.medium, v.content
    order by count(*) desc, v.campaign, v.medium, v.content
    limit 100;
end;
$$;

grant execute on function public.admin_utm_breakdown(int) to authenticated;
