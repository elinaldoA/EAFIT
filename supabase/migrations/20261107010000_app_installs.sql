-- Instalações e (indícios de) desinstalação do app, pro painel admin
-- (Dashboard → Instalações).
--
-- O EAFIT é um app web instalável (PWA), fora de loja: "baixar" é instalar, e
-- nenhum navegador avisa quando o app é desinstalado. Então:
--
--   * app_installs — uma linha por aparelho (identificador aleatório guardado
--     no navegador, lib/tracking.js → trackInstall). Grava quando a tela
--     "Instale o app" apareceu, a resposta ao botão de instalar, o aviso
--     `appinstalled` do navegador (Chrome/Edge/Samsung, Android e computador)
--     e a primeira e a última abertura pelo ícone — no iPhone é o único jeito
--     de saber que instalou. Quem já usava o app instalado antes desta
--     migration entra como 'anterior' e não conta como instalação nova.
--
--   * push_stale_log — o melhor sinal de desinstalação: quando o app sai do
--     aparelho, a inscrição de notificações morre e o próximo envio volta
--     404/410. As Edge Functions apagam a inscrição por push_drop_stale(), que
--     registra a data, a conta e a plataforma. Também acontece se a pessoa
--     bloquear as notificações — o painel diz isso.
--
-- Escrita só pelas funções abaixo; linhas apagadas junto com a conta.

-- ---------------------------------------------------------------------------
-- 1. Aparelhos
-- ---------------------------------------------------------------------------
create table if not exists public.app_installs (
  device_id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  os text not null default 'outro' check (os in ('android', 'ios', 'windows', 'mac', 'linux', 'outro')),
  browser text not null default 'outro' check (browser in ('chrome', 'safari', 'firefox', 'edge', 'samsung', 'opera', 'outro')),
  screen_shown_at timestamptz,
  prompt_answer text check (prompt_answer in ('accepted', 'dismissed')),
  prompt_answer_at timestamptz,
  installed_at timestamptz,
  -- prompt = botão "Instalar app"; browser = aviso do navegador sem o botão
  -- (menu); icon = só pela primeira abertura pelo ícone (iPhone, Firefox);
  -- anterior = já instalado antes de existir esta medição.
  install_source text check (install_source in ('prompt', 'browser', 'icon', 'anterior')),
  first_open_at timestamptz,
  last_open_on date,
  open_days integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_installs_user_idx on public.app_installs (user_id);
create index if not exists app_installs_installed_idx on public.app_installs (installed_at);

alter table public.app_installs enable row level security;

drop policy if exists "admin reads app installs" on public.app_installs;
create policy "admin reads app installs" on public.app_installs
  for select using (public.is_admin());

revoke all on public.app_installs from anon, authenticated;

-- Mesmo teto diário das outras tabelas que aceitam gravação sem login.
drop trigger if exists app_installs_daily_cap on public.app_installs;
create trigger app_installs_daily_cap
  before insert on public.app_installs
  for each row execute function public.enforce_daily_insert_cap(5000);

-- Contas que já abriam o app instalado antes desta migration: o primeiro
-- aparelho delas que aparecer abrindo pelo ícone entra como 'anterior'.
create table if not exists public.app_install_baseline (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.app_install_baseline enable row level security;
revoke all on public.app_install_baseline from anon, authenticated;

insert into public.app_install_baseline (user_id)
select uc.user_id from public.user_client uc where uc.display_mode = 'standalone'
on conflict do nothing;

-- Eventos: screen_shown (tela "Instale o app" apareceu), prompt_accepted /
-- prompt_dismissed (resposta ao botão), installed (aviso do navegador),
-- open (abriu pelo ícone; o app manda 1 vez por dia). Valor fora da lista
-- vira 'outro'; evento desconhecido é ignorado.
create or replace function public.track_install(p_device uuid, p_event text, p_os text default 'outro', p_browser text default 'outro')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_os text := case when p_os in ('android', 'ios', 'windows', 'mac', 'linux') then p_os else 'outro' end;
  v_browser text := case when p_browser in ('chrome', 'safari', 'firefox', 'edge', 'samsung', 'opera') then p_browser else 'outro' end;
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  r public.app_installs;
begin
  if p_device is null or p_event not in ('screen_shown', 'prompt_accepted', 'prompt_dismissed', 'installed', 'open') then
    return;
  end if;

  insert into public.app_installs (device_id, user_id, os, browser)
  values (p_device, v_uid, v_os, v_browser)
  on conflict (device_id) do update set
    user_id = coalesce(app_installs.user_id, excluded.user_id),
    os = excluded.os, browser = excluded.browser, updated_at = now()
  returning * into r;

  if p_event = 'screen_shown' then
    update public.app_installs set screen_shown_at = coalesce(screen_shown_at, now())
    where device_id = p_device;

  elsif p_event in ('prompt_accepted', 'prompt_dismissed') then
    -- Aceitou uma vez, fica aceito (recusar depois não desfaz a instalação).
    if r.prompt_answer is distinct from 'accepted' then
      update public.app_installs
      set prompt_answer = case when p_event = 'prompt_accepted' then 'accepted' else 'dismissed' end,
          prompt_answer_at = now()
      where device_id = p_device;
    end if;

  elsif p_event = 'installed' then
    update public.app_installs
    set installed_at = coalesce(installed_at, now()),
        install_source = coalesce(install_source, case when r.prompt_answer = 'accepted' then 'prompt' else 'browser' end)
    where device_id = p_device;

  elsif p_event = 'open' then
    update public.app_installs a
    set first_open_at = coalesce(a.first_open_at, now()),
        installed_at = coalesce(a.installed_at, now()),
        install_source = coalesce(a.install_source,
          case when v_uid is not null
                and exists (select 1 from public.app_install_baseline b where b.user_id = v_uid)
                and not exists (select 1 from public.app_installs o where o.user_id = v_uid and o.device_id <> p_device and o.installed_at is not null)
               then 'anterior' else 'icon' end),
        open_days = a.open_days + case when a.last_open_on is distinct from v_today then 1 else 0 end,
        last_open_on = v_today
    where a.device_id = p_device;
  end if;
end;
$$;

revoke execute on function public.track_install(uuid, text, text, text) from public;
grant execute on function public.track_install(uuid, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Inscrições de notificação que morreram (404/410)
-- ---------------------------------------------------------------------------
create table if not exists public.push_stale_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  platform text not null check (platform in ('android', 'ios', 'windows', 'firefox', 'outro')),
  subscribed_at timestamptz,
  detected_at timestamptz not null default now()
);

create index if not exists push_stale_log_detected_idx on public.push_stale_log (detected_at);

alter table public.push_stale_log enable row level security;

drop policy if exists "admin reads push stale log" on public.push_stale_log;
create policy "admin reads push stale log" on public.push_stale_log
  for select using (public.is_admin());

revoke all on public.push_stale_log from anon, authenticated;

-- Plataforma pelo servidor de push do endereço da inscrição.
create or replace function public.push_platform(p_endpoint text)
returns text
language sql
immutable
as $$
  select case
    when p_endpoint ~* '^https://web\.push\.apple\.com/' then 'ios'
    when p_endpoint ~* '^https://(fcm\.googleapis\.com|android\.googleapis\.com)/' then 'android'
    when p_endpoint ~* '\.notify\.windows\.com/' then 'windows'
    when p_endpoint ~* 'push\.services\.mozilla\.com/' then 'firefox'
    else 'outro'
  end;
$$;

-- Chamada pelas Edge Functions no lugar do delete direto: registra e apaga.
-- O fcm (Chrome) atende tanto Android quanto computador; a plataforma vem do
-- aparelho mais recente da conta quando houver.
create or replace function public.push_drop_stale(p_endpoints text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if p_endpoints is null or cardinality(p_endpoints) = 0 then return 0; end if;

  insert into public.push_stale_log (user_id, platform, subscribed_at)
  select s.user_id,
         case
           when public.push_platform(s.endpoint) = 'android' then coalesce((
             select case when a.os in ('windows', 'mac', 'linux') then 'windows' else 'android' end
             from public.app_installs a
             where a.user_id = s.user_id and a.browser in ('chrome', 'edge', 'samsung', 'opera')
             order by a.updated_at desc limit 1), 'android')
           else public.push_platform(s.endpoint)
         end,
         s.created_at
  from public.push_subscriptions s
  where s.endpoint = any (p_endpoints);

  delete from public.push_subscriptions s where s.endpoint = any (p_endpoints);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.push_drop_stale(text[]) from public, anon, authenticated;
grant execute on function public.push_drop_stale(text[]) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Painel (sem admins)
-- ---------------------------------------------------------------------------

-- Resumo do período. Instalações = installed_at no período, sem as 'anterior'.
create or replace function public.admin_install_summary(days_back int default 30)
returns table (
  screen_shown bigint, prompt_accepted bigint, prompt_dismissed bigint,
  installs bigint, installs_prompt bigint, installs_browser bigint, installs_icon bigint,
  first_opens bigint, installed_total bigint, active_30d bigint, inactive_30d bigint,
  push_stale bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  since date := case when days_back is null or days_back <= 0 then null else today - (days_back - 1) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with a as (
      select i.*,
             (since is null or (i.installed_at at time zone 'America/Sao_Paulo')::date >= since) as inst_in,
             (since is null or (i.screen_shown_at at time zone 'America/Sao_Paulo')::date >= since) as shown_in,
             (since is null or (i.prompt_answer_at at time zone 'America/Sao_Paulo')::date >= since) as answer_in,
             (since is null or (i.first_open_at at time zone 'America/Sao_Paulo')::date >= since) as open_in
      from public.app_installs i
      left join public.profiles p on p.id = i.user_id
      where not coalesce(p.is_admin, false)
    )
    select
      count(*) filter (where a.screen_shown_at is not null and a.shown_in),
      count(*) filter (where a.prompt_answer = 'accepted' and a.answer_in),
      count(*) filter (where a.prompt_answer = 'dismissed' and a.answer_in),
      count(*) filter (where a.installed_at is not null and a.inst_in and a.install_source <> 'anterior'),
      count(*) filter (where a.install_source = 'prompt' and a.inst_in),
      count(*) filter (where a.install_source = 'browser' and a.inst_in),
      count(*) filter (where a.install_source = 'icon' and a.inst_in),
      count(*) filter (where a.first_open_at is not null and a.open_in and a.install_source <> 'anterior'),
      count(*) filter (where a.installed_at is not null),
      count(*) filter (where a.last_open_on >= today - 29),
      count(*) filter (where a.installed_at is not null and coalesce(a.last_open_on, (a.installed_at at time zone 'America/Sao_Paulo')::date) < today - 29),
      (select count(*) from public.push_stale_log l
         left join public.profiles p on p.id = l.user_id
         where not coalesce(p.is_admin, false)
           and (since is null or (l.detected_at at time zone 'America/Sao_Paulo')::date >= since))
    from a;
end;
$$;

grant execute on function public.admin_install_summary(int) to authenticated;

-- Por dia: instalações novas e inscrições de push que morreram.
create or replace function public.admin_install_daily(days_back int default 30)
returns table (day date, installs bigint, push_stale bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  n int := greatest(1, least(coalesce(nullif(days_back, 0), 90), 365));
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select d::date,
      (select count(*) from public.app_installs i
         left join public.profiles p on p.id = i.user_id
         where not coalesce(p.is_admin, false) and i.install_source <> 'anterior'
           and (i.installed_at at time zone 'America/Sao_Paulo')::date = d::date),
      (select count(*) from public.push_stale_log l
         left join public.profiles p on p.id = l.user_id
         where not coalesce(p.is_admin, false)
           and (l.detected_at at time zone 'America/Sao_Paulo')::date = d::date)
    from generate_series(today - (n - 1), today, interval '1 day') d
    order by 1;
end;
$$;

grant execute on function public.admin_install_daily(int) to authenticated;

-- Por sistema: instalados, novos no período, ativos e sinais de desinstalação.
create or replace function public.admin_install_by_os(days_back int default 30)
returns table (os text, installed_total bigint, installs bigint, active_30d bigint, push_stale bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  since date := case when days_back is null or days_back <= 0 then null else today - (days_back - 1) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with a as (
      select i.os as o, i.installed_at, i.install_source, i.last_open_on
      from public.app_installs i
      left join public.profiles p on p.id = i.user_id
      where not coalesce(p.is_admin, false) and i.installed_at is not null
    ),
    s as (
      select case l.platform when 'android' then 'android' when 'ios' then 'ios'
                             when 'windows' then 'windows' else 'outro' end as o,
             count(*) as n
      from public.push_stale_log l
      left join public.profiles p on p.id = l.user_id
      where not coalesce(p.is_admin, false)
        and (since is null or (l.detected_at at time zone 'America/Sao_Paulo')::date >= since)
      group by 1
    ),
    oses as (select a.o from a union select s.o from s)
    select oses.o,
      (select count(*) from a where a.o = oses.o),
      (select count(*) from a where a.o = oses.o and a.install_source <> 'anterior'
         and (since is null or (a.installed_at at time zone 'America/Sao_Paulo')::date >= since)),
      (select count(*) from a where a.o = oses.o and a.last_open_on >= today - 29),
      coalesce((select s.n from s where s.o = oses.o), 0)
    from oses
    order by 2 desc, 1;
end;
$$;

grant execute on function public.admin_install_by_os(int) to authenticated;

-- Últimas inscrições de notificação que morreram, com a conta (pra abrir a
-- ficha) e quando ela tinha ativado as notificações.
create or replace function public.admin_push_stale_recent(max_rows int default 20)
returns table (detected_at timestamptz, platform text, subscribed_at timestamptz, user_id uuid, email text, nome text, still_has_push boolean)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select l.detected_at, l.platform, l.subscribed_at, l.user_id, u.email::text,
           coalesce(nullif(u.raw_user_meta_data->>'nome', ''), nullif(u.raw_user_meta_data->>'name', ''))::text,
           exists (select 1 from public.push_subscriptions s where s.user_id = l.user_id)
    from public.push_stale_log l
    left join auth.users u on u.id = l.user_id
    left join public.profiles p on p.id = l.user_id
    where not coalesce(p.is_admin, false)
    order by l.detected_at desc
    limit greatest(1, least(coalesce(max_rows, 20), 100));
end;
$$;

grant execute on function public.admin_push_stale_recent(int) to authenticated;
