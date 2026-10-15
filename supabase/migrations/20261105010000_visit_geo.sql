-- Localização de quem visita o site/tela de acesso e de quem usa o app, pro
-- mapa do painel admin (Dashboard → Localização).
--
-- Como funciona:
--   1. O IP vem dos cabeçalhos da própria requisição (request_ip(), lido do
--      request.headers que o PostgREST repassa). App e site continuam gravando
--      do mesmo jeito: quem preenche o IP é o banco, o cliente não manda nada.
--        * page_visits: trigger antes do insert
--        * user_client: dentro de track_client (último IP da conta)
--   2. A Edge Function resolve-geo, chamada pelo pg_cron
--      (20261105020000_resolve_geo_cron.sql), pega os IPs pendentes
--      (geo_pending), consulta o ipinfo.io e grava país, estado e cidade
--      (geo_apply).
--   3. O IP bruto some depois de 90 dias (purge_old_ips, cron diário); país,
--      estado e cidade ficam. Na conta, o prazo conta do último acesso.
--
-- Consta na Política de Privacidade (seções "Visitas" e "Uso do app").
-- Visitas anteriores a esta migration não têm IP e aparecem como "sem
-- localização" no painel.

-- ---------------------------------------------------------------------------
-- IP público de quem fez a requisição (null se não houver, for inválido ou
-- de rede interna). cf-connecting-ip é posto pela Cloudflare na frente do
-- Supabase e não dá pra forjar; x-forwarded-for fica de reserva.
-- ---------------------------------------------------------------------------
create or replace function public.request_ip()
returns inet
language plpgsql
stable
set search_path = public
as $$
declare
  h json;
  raw text;
  ip inet;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  if h is null then return null; end if;

  raw := coalesce(
    nullif(trim(h->>'cf-connecting-ip'), ''),
    nullif(trim(h->>'x-real-ip'), ''),
    nullif(trim(split_part(coalesce(h->>'x-forwarded-for', ''), ',', 1)), '')
  );
  if raw is null then return null; end if;

  begin
    ip := host(raw::inet)::inet;
  exception when others then
    return null;
  end;

  if family(ip) = 4 and (
       ip << '10.0.0.0/8' or ip << '172.16.0.0/12' or ip << '192.168.0.0/16'
    or ip << '127.0.0.0/8' or ip << '100.64.0.0/10' or ip << '169.254.0.0/16'
  ) then return null; end if;
  if family(ip) = 6 and (ip = '::1'::inet or ip << 'fc00::/7' or ip << 'fe80::/10') then
    return null;
  end if;
  return ip;
end;
$$;

revoke execute on function public.request_ip() from public, anon, authenticated;

-- Faixa etária a partir da idade do cadastro (user_metadata.idade, 14–100).
create or replace function public.age_band(p_idade text)
returns text
language sql
immutable
as $$
  select case
    when p_idade is null or p_idade !~ '^\s*\d{1,3}\s*$' then 'não informado'
    when trim(p_idade)::int < 18 then '14–17'
    when trim(p_idade)::int < 25 then '18–24'
    when trim(p_idade)::int < 35 then '25–34'
    when trim(p_idade)::int < 45 then '35–44'
    when trim(p_idade)::int < 55 then '45–54'
    else '55+'
  end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Colunas de IP e localização
-- country = ISO 3166-1 alfa-2 (BR, PT, US…); uf = sigla do estado, só no
-- Brasil; region = nome do estado/província como o provedor devolve.
-- geo_at preenchido = já consultado (com ou sem sucesso: country null).
-- ---------------------------------------------------------------------------
alter table public.page_visits
  add column if not exists ip inet,
  add column if not exists country text check (country ~ '^[A-Z]{2}$'),
  add column if not exists region text check (char_length(region) <= 80),
  add column if not exists uf text check (uf ~ '^[A-Z]{2}$'),
  add column if not exists city text check (char_length(city) <= 80),
  add column if not exists geo_at timestamptz;

alter table public.user_client
  add column if not exists ip inet,
  add column if not exists country text check (country ~ '^[A-Z]{2}$'),
  add column if not exists region text check (char_length(region) <= 80),
  add column if not exists uf text check (uf ~ '^[A-Z]{2}$'),
  add column if not exists city text check (char_length(city) <= 80),
  add column if not exists geo_at timestamptz;

create index if not exists page_visits_geo_pending_idx on public.page_visits (ip)
  where geo_at is null and ip is not null;

-- O visitante continua sem poder escrever essas colunas (grant por coluna de
-- 20261027010000_behavior_tracking.sql); quem preenche é o trigger.
create or replace function public.page_visits_capture_ip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.ip := public.request_ip();
  new.country := null; new.region := null; new.uf := null; new.city := null; new.geo_at := null;
  return new;
end;
$$;

revoke execute on function public.page_visits_capture_ip() from public, anon, authenticated;

drop trigger if exists page_visits_capture_ip on public.page_visits;
create trigger page_visits_capture_ip
  before insert on public.page_visits
  for each row execute function public.page_visits_capture_ip();

-- ---------------------------------------------------------------------------
-- 2. track_client grava também o último IP da conta. IP novo = localização
-- refeita pelo resolve-geo (a anterior fica até lá).
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
end;
$$;

revoke execute on function public.track_client(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.track_client(text, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Fila do resolve-geo (só service role)
-- ---------------------------------------------------------------------------

-- IPs ainda sem localização. Antes de listar, reaproveita o que já foi
-- descoberto pro mesmo IP nos últimos 30 dias (cada IP é consultado uma vez).
-- Visitas com mais de 7 dias na fila são abandonadas (ficam sem localização).
create or replace function public.geo_pending(max_rows int default 200)
returns table (ip inet)
language plpgsql
security definer
set search_path = public
as $$
begin
  with known as (
    select distinct on (k.ip) k.ip, k.country, k.region, k.uf, k.city, k.geo_at
    from (
      select v.ip, v.country, v.region, v.uf, v.city, v.geo_at from public.page_visits v
      where v.geo_at > now() - interval '30 days' and v.ip is not null
      union all
      select c.ip, c.country, c.region, c.uf, c.city, c.geo_at from public.user_client c
      where c.geo_at > now() - interval '30 days' and c.ip is not null
    ) k
    order by k.ip, k.geo_at desc
  )
  update public.page_visits v set
    country = known.country, region = known.region, uf = known.uf, city = known.city, geo_at = now()
  from known
  where v.ip = known.ip and v.geo_at is null;

  with known as (
    select distinct on (v.ip) v.ip, v.country, v.region, v.uf, v.city
    from public.page_visits v
    where v.geo_at > now() - interval '30 days' and v.ip is not null
    order by v.ip, v.geo_at desc
  )
  update public.user_client c set
    country = known.country, region = known.region, uf = known.uf, city = known.city, geo_at = now()
  from known
  where c.ip = known.ip and c.geo_at is null;

  return query
    select distinct p.ip from (
      select v.ip from public.page_visits v
      where v.geo_at is null and v.ip is not null and v.created_at > now() - interval '7 days'
      union
      select c.ip from public.user_client c
      where c.geo_at is null and c.ip is not null
    ) p
    limit greatest(1, least(coalesce(max_rows, 200), 1000));
end;
$$;

-- Grava o resultado da consulta de um IP. País null = não deu pra localizar
-- (fica marcado como consultado e não volta pra fila).
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
end;
$$;

-- IP bruto apagado depois de 90 dias (visita: da data da visita; conta: do
-- último acesso). A localização derivada fica.
create or replace function public.purge_old_ips()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  a bigint;
  b bigint;
begin
  update public.page_visits v set ip = null
  where v.ip is not null and v.created_at < now() - interval '90 days';
  get diagnostics a = row_count;

  update public.user_client c set ip = null
  where c.ip is not null and c.updated_at < now() - interval '90 days';
  get diagnostics b = row_count;

  return a + b;
end;
$$;

revoke execute on function public.geo_pending(int) from public, anon, authenticated;
revoke execute on function public.geo_apply(inet, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.purge_old_ips() from public, anon, authenticated;
grant execute on function public.geo_pending(int) to service_role;
grant execute on function public.geo_apply(inet, text, text, text, text) to service_role;
grant execute on function public.purge_old_ips() to service_role;

-- Todo dia às 06:30 UTC (03:30 de Brasília). SQL puro, não depende de Edge
-- Function. Pra desligar: select cron.unschedule('purge-old-ips-daily');
select cron.schedule('purge-old-ips-daily', '30 6 * * *', $$ select public.purge_old_ips(); $$);

-- ---------------------------------------------------------------------------
-- 4. Leitura no painel
-- status: 'ok' (localizado), 'pendente' (na fila do resolve-geo) ou
-- 'sem_local' (sem IP — visita antiga — ou o provedor não localizou).
-- ---------------------------------------------------------------------------
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
                when v.geo_at is null and v.ip is not null then 'pendente'
                else 'sem_local' end,
           v.country, v.uf, v.region, v.city, count(*)::bigint
    from public.page_visits v
    where since is null or v.visited_on >= since
    group by 1, 2, 3, 4, 5, 6;
end;
$$;

grant execute on function public.admin_visit_geo(int) to authenticated;

-- Contas vistas no período por localização, sexo e faixa etária (sem admins).
create or replace function public.admin_user_geo(days_back int default 30)
returns table (status text, country text, uf text, region text, city text, sexo text, faixa text, users bigint)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  since date := case when days_back is null or days_back <= 0 then null
                     else (now() at time zone 'America/Sao_Paulo')::date - (days_back - 1) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select case when uc.country is not null then 'ok'
                when uc.geo_at is null and uc.ip is not null then 'pendente'
                else 'sem_local' end,
           uc.country, uc.uf, uc.region, uc.city,
           coalesce(nullif(u.raw_user_meta_data->>'sexo', ''), 'não informado'),
           public.age_band(u.raw_user_meta_data->>'idade'),
           count(*)::bigint
    from public.user_client uc
    join auth.users u on u.id = uc.user_id
    left join public.profiles p on p.id = uc.user_id
    where (since is null or uc.last_seen >= since) and not coalesce(p.is_admin, false)
    group by 1, 2, 3, 4, 5, 6, 7;
end;
$$;

grant execute on function public.admin_user_geo(int) to authenticated;

-- Ficha do usuário: retrato do último acesso agora com IP e localização.
-- O tipo de retorno muda, então drop antes.
drop function if exists public.admin_user_client(uuid);

create function public.admin_user_client(target uuid)
returns table (
  os text, browser text, device text, display_mode text, app_version text,
  lang text, push_permission text, last_seen date,
  ip text, country text, uf text, region text, city text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select uc.os, uc.browser, uc.device, uc.display_mode, uc.app_version,
           uc.lang, uc.push_permission, uc.last_seen,
           host(uc.ip), uc.country, uc.uf, uc.region, uc.city
    from public.user_client uc
    where uc.user_id = target;
end;
$$;

grant execute on function public.admin_user_client(uuid) to authenticated;

-- Perfil do público ganha a faixa etária (idade já é pedida no onboarding).
create or replace function public.admin_profile_distribution()
returns table (dimension text, value text, total bigint)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with us as (
      select u.raw_user_meta_data as md
      from auth.users u
      left join public.profiles p on p.id = u.id
      where not coalesce(p.is_admin, false)
    )
    select 'meta'::text, coalesce(nullif(us.md->>'meta', ''), 'não informado'), count(*)::bigint from us group by 2
    union all
    select 'nivel'::text, coalesce(nullif(us.md->>'nivel', ''), 'não informado'), count(*)::bigint from us group by 2
    union all
    select 'sexo'::text, coalesce(nullif(us.md->>'sexo', ''), 'não informado'), count(*)::bigint from us group by 2
    union all
    select 'faixa_etaria'::text, public.age_band(us.md->>'idade'), count(*)::bigint from us group by 2;
end;
$$;

grant execute on function public.admin_profile_distribution() to authenticated;
