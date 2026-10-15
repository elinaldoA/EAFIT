-- Acessos ao app no mapa do painel (Dashboard → Localização), além das
-- visitas ao site. Complementa 20261105010000_visit_geo.sql.
--
-- page_visits só conta quem não está logado (site e tela de acesso); quem já
-- tem sessão entra direto e só atualizava o retrato do último acesso
-- (user_client, 1 linha por conta). Aqui cada dia de uso vira uma linha em
-- app_access_days, com o IP daquele dia, gravada pelo mesmo track_client que
-- o app já chama (1 vez por dia por aparelho) — o app não muda e as métricas
-- de divulgação (funil, origens) continuam só com page_visits.
--
-- Mesmo ciclo do resto: resolve-geo localiza (geo_pending/geo_apply), IP
-- apagado em 90 dias (purge_old_ips), linhas apagadas junto com a conta.

create table if not exists public.app_access_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default (now() at time zone 'America/Sao_Paulo')::date,
  ip inet,
  country text check (country ~ '^[A-Z]{2}$'),
  region text check (char_length(region) <= 80),
  uf text check (uf ~ '^[A-Z]{2}$'),
  city text check (char_length(city) <= 80),
  geo_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

create index if not exists app_access_days_day_idx on public.app_access_days (day);
create index if not exists app_access_days_geo_pending_idx on public.app_access_days (ip)
  where geo_at is null and ip is not null;

alter table public.app_access_days enable row level security;

drop policy if exists "admin reads app access days" on public.app_access_days;
create policy "admin reads app access days" on public.app_access_days
  for select using (public.is_admin());

-- Ninguém escreve direto: só track_client.
revoke all on public.app_access_days from anon, authenticated;

-- Quem já abriu o app hoje (antes desta migration) entra com o IP do retrato.
insert into public.app_access_days (user_id, day, ip, country, region, uf, city, geo_at)
select uc.user_id, uc.last_seen, uc.ip, uc.country, uc.region, uc.uf, uc.city, uc.geo_at
from public.user_client uc
where uc.last_seen = (now() at time zone 'America/Sao_Paulo')::date
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- track_client: além do retrato, registra o dia de uso (o primeiro IP do dia).
-- ---------------------------------------------------------------------------
create or replace function public.track_client(
  p_os text, p_browser text, p_device text, p_display_mode text,
  p_app_version text, p_lang text, p_push_permission text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_os text := case when p_os in ('android', 'ios', 'windows', 'mac', 'linux') then p_os else 'outro' end;
  v_browser text := case when p_browser in ('chrome', 'safari', 'firefox', 'edge', 'samsung', 'opera') then p_browser else 'outro' end;
  v_device text := case when p_device in ('celular', 'tablet') then p_device else 'desktop' end;
  v_mode text := case when p_display_mode = 'standalone' then 'standalone' else 'browser' end;
  v_version text := case when coalesce(p_app_version, '') ~ '^[0-9a-z.+-]{0,20}$' then coalesce(p_app_version, '') else '' end;
  v_lang text := case when p_lang in ('pt', 'en') then p_lang else 'outro' end;
  v_push text := case when p_push_permission in ('granted', 'denied', 'default') then p_push_permission else 'unsupported' end;
  v_ip inet := public.request_ip();
begin
  if auth.uid() is null then return; end if;

  insert into public.user_client as c
    (user_id, os, browser, device, display_mode, app_version, lang, push_permission, ip)
  values (auth.uid(), v_os, v_browser, v_device, v_mode, v_version, v_lang, v_push, v_ip)
  on conflict (user_id) do update set
    os = excluded.os, browser = excluded.browser, device = excluded.device,
    display_mode = excluded.display_mode, app_version = excluded.app_version,
    lang = excluded.lang, push_permission = excluded.push_permission,
    ip = coalesce(excluded.ip, c.ip),
    geo_at = case when excluded.ip is not null and excluded.ip is distinct from c.ip then null else c.geo_at end,
    last_seen = (now() at time zone 'America/Sao_Paulo')::date, updated_at = now();

  insert into public.app_access_days (user_id, ip)
  values (auth.uid(), v_ip)
  on conflict (user_id, day) do update set ip = excluded.ip
    where app_access_days.ip is null and excluded.ip is not null;
end;
$$;

revoke execute on function public.track_client(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.track_client(text, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Fila do resolve-geo agora com as três tabelas.
-- ---------------------------------------------------------------------------
-- Localização já descoberta pra cada IP nos últimos 30 dias (a mais recente).
create or replace function public.geo_known_ips()
returns table (ip inet, country text, region text, uf text, city text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (k.ip) k.ip, k.country, k.region, k.uf, k.city
  from (
    select v.ip, v.country, v.region, v.uf, v.city, v.geo_at from public.page_visits v
    where v.geo_at > now() - interval '30 days' and v.ip is not null
    union all
    select c.ip, c.country, c.region, c.uf, c.city, c.geo_at from public.user_client c
    where c.geo_at > now() - interval '30 days' and c.ip is not null
    union all
    select a.ip, a.country, a.region, a.uf, a.city, a.geo_at from public.app_access_days a
    where a.geo_at > now() - interval '30 days' and a.ip is not null
  ) k
  order by k.ip, k.geo_at desc;
$$;

revoke execute on function public.geo_known_ips() from public, anon, authenticated;

create or replace function public.geo_pending(max_rows int default 200)
returns table (ip inet)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Reaproveita o que já foi descoberto pro mesmo IP (cada IP é consultado uma vez).
  update public.page_visits v set
    country = k.country, region = k.region, uf = k.uf, city = k.city, geo_at = now()
  from public.geo_known_ips() k where v.ip = k.ip and v.geo_at is null;

  update public.user_client c set
    country = k.country, region = k.region, uf = k.uf, city = k.city, geo_at = now()
  from public.geo_known_ips() k where c.ip = k.ip and c.geo_at is null;

  update public.app_access_days a set
    country = k.country, region = k.region, uf = k.uf, city = k.city, geo_at = now()
  from public.geo_known_ips() k where a.ip = k.ip and a.geo_at is null;

  return query
    select distinct p.ip from (
      select v.ip from public.page_visits v
      where v.geo_at is null and v.ip is not null and v.created_at > now() - interval '7 days'
      union
      select c.ip from public.user_client c
      where c.geo_at is null and c.ip is not null
      union
      select a.ip from public.app_access_days a
      where a.geo_at is null and a.ip is not null and a.created_at > now() - interval '7 days'
    ) p
    limit greatest(1, least(coalesce(max_rows, 200), 1000));
end;
$$;

create or replace function public.geo_apply(p_ip inet, p_country text, p_region text, p_uf text, p_city text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country text := case when upper(coalesce(p_country, '')) ~ '^[A-Z]{2}$' then upper(p_country) end;
  v_uf text := case when v_country = 'BR' and upper(coalesce(p_uf, '')) ~ '^[A-Z]{2}$' then upper(p_uf) end;
  v_region text := left(nullif(trim(coalesce(p_region, '')), ''), 80);
  v_city text := left(nullif(trim(coalesce(p_city, '')), ''), 80);
begin
  update public.page_visits v set
    country = v_country, region = v_region, uf = v_uf, city = v_city, geo_at = now()
  where v.ip = p_ip and v.geo_at is null;

  update public.user_client c set
    country = v_country, region = v_region, uf = v_uf, city = v_city, geo_at = now()
  where c.ip = p_ip and c.geo_at is null;

  update public.app_access_days a set
    country = v_country, region = v_region, uf = v_uf, city = v_city, geo_at = now()
  where a.ip = p_ip and a.geo_at is null;
end;
$$;

create or replace function public.purge_old_ips()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  a bigint;
  b bigint;
  c bigint;
begin
  update public.page_visits v set ip = null
  where v.ip is not null and v.created_at < now() - interval '90 days';
  get diagnostics a = row_count;

  update public.user_client uc set ip = null
  where uc.ip is not null and uc.updated_at < now() - interval '90 days';
  get diagnostics b = row_count;

  update public.app_access_days d set ip = null
  where d.ip is not null and d.created_at < now() - interval '90 days';
  get diagnostics c = row_count;

  return a + b + c;
end;
$$;

revoke execute on function public.geo_pending(int) from public, anon, authenticated;
revoke execute on function public.geo_apply(inet, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.purge_old_ips() from public, anon, authenticated;
grant execute on function public.geo_pending(int) to service_role;
grant execute on function public.geo_apply(inet, text, text, text, text) to service_role;
grant execute on function public.purge_old_ips() to service_role;

-- ---------------------------------------------------------------------------
-- Painel: dias de uso do app por localização (sem admins). Mesmo formato de
-- admin_visit_geo, com page = 'app', pro painel somar com as visitas.
-- ---------------------------------------------------------------------------
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
                when d.geo_at is null and d.ip is not null then 'pendente'
                else 'sem_local' end,
           d.country, d.uf, d.region, d.city, count(*)::bigint
    from public.app_access_days d
    left join public.profiles p on p.id = d.user_id
    where (since is null or d.day >= since) and not coalesce(p.is_admin, false)
    group by 2, 3, 4, 5, 6;
end;
$$;

grant execute on function public.admin_app_geo(int) to authenticated;
