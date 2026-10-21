-- Jornada de quem visita e não cria conta (Análises → Comportamento →
-- "Visitantes que não converteram").
--
-- As visitas continuam sem conta, sem nome e sem e-mail. O que muda: o
-- identificador aleatório do navegador que o app já usava nas instalações
-- (localStorage eafit_device_id, lib/tracking.js → deviceId) passa a ir junto
-- das visitas (page_visits), dos eventos da landing (landing_events) e da tela
-- de acesso (auth_events). Assim dá pra saber, por navegador, quantos dias a
-- pessoa voltou, de onde veio da primeira vez e em que etapa parou.
--
-- Conversão: o navegador que entra numa conta grava o identificador em
-- visitor_accounts — só o identificador e a data, nunca QUAL conta. A política
-- de privacidade continua valendo: a visita não é ligada à conta.
--
-- Quem grava: app-react/src/lib/pageVisits.js, lib/tracking.js e o <script>
-- da landing (public/landing/assets/site.js), que gera o identificador com a
-- mesma chave. Visitas de antes desta migration não têm identificador e ficam
-- fora da jornada (continuam nas contagens de sempre).

-- ---------------------------------------------------------------------------
-- 1. Identificador do navegador nas tabelas anônimas
-- ---------------------------------------------------------------------------
alter table public.page_visits add column if not exists visitor_id uuid;
alter table public.landing_events add column if not exists visitor_id uuid;
alter table public.auth_events add column if not exists visitor_id uuid;

create index if not exists page_visits_visitor_idx on public.page_visits (visitor_id, visited_on) where visitor_id is not null;
create index if not exists landing_events_visitor_idx on public.landing_events (visitor_id, visited_on) where visitor_id is not null;
create index if not exists auth_events_visitor_idx on public.auth_events (visitor_id, visited_on) where visitor_id is not null;

grant insert (page, source, os, browser, device, lang, campaign, ref, personal, visitor_id) on public.page_visits to anon, authenticated;
grant insert (event, place, visitor_id) on public.landing_events to anon, authenticated;
grant insert (event, detail, visitor_id) on public.auth_events to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Navegadores que já entraram numa conta (sem dizer qual)
-- ---------------------------------------------------------------------------
create table if not exists public.visitor_accounts (
  visitor_id uuid primary key,
  first_on date not null default (now() at time zone 'America/Sao_Paulo')::date,
  created_at timestamptz not null default now()
);

alter table public.visitor_accounts enable row level security;

drop policy if exists "admin reads visitor accounts" on public.visitor_accounts;
create policy "admin reads visitor accounts" on public.visitor_accounts
  for select using (public.is_admin());

revoke all on public.visitor_accounts from anon, authenticated;

drop trigger if exists visitor_accounts_daily_cap on public.visitor_accounts;
create trigger visitor_accounts_daily_cap
  before insert on public.visitor_accounts
  for each row execute function public.enforce_daily_insert_cap(5000);

-- Chamado pelo app quando há sessão (lib/tracking.js → markVisitor). Admin não
-- conta (20261127010000_no_admin_tracking.sql).
create or replace function public.mark_visitor(p_visitor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_visitor is null or auth.uid() is null or public.is_admin() then return; end if;
  insert into public.visitor_accounts (visitor_id) values (p_visitor) on conflict do nothing;
end;
$$;

revoke execute on function public.mark_visitor(uuid) from public, anon;
grant execute on function public.mark_visitor(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Jornada por navegador no período (base das duas funções do painel)
--   jv_stage = etapa mais avançada:
--     cadastrou         criou conta (signup_ok)
--     ja_tinha_conta    entrou numa conta que já existia
--     erro_cadastro     tentou criar e deu erro
--     enviou            tentou enviar o cadastro (sem erro nem conta)
--     comecou_cadastro  digitou e-mail ou senha em Criar conta
--     tela_acesso       chegou à tela de login/cadastro
--     clicou_cta        clicou num botão da landing que leva ao app
--     so_landing        só viu a landing
-- Não é concedida a ninguém: só as funções admin_* abaixo usam.
-- ---------------------------------------------------------------------------
create or replace function public.visitor_journeys(since date)
returns table (
  jv_visitor uuid, jv_first_at timestamptz, jv_last_at timestamptz, jv_days int,
  jv_source text, jv_campaign text, jv_device text, jv_stage text, jv_error text
)
language sql
stable
security definer
set search_path = public
as $$
  with pv as (
    select v.visitor_id as vid, v.visited_on as d, v.created_at as at, v.page, v.source, v.campaign, v.device
    from public.page_visits v
    where v.visitor_id is not null and (since is null or v.visited_on >= since)
  ),
  le as (
    select e.visitor_id as vid, e.visited_on as d, e.created_at as at, e.event
    from public.landing_events e
    where e.visitor_id is not null and (since is null or e.visited_on >= since)
  ),
  ae as (
    select e.visitor_id as vid, e.visited_on as d, e.created_at as at, e.event, e.detail
    from public.auth_events e
    where e.visitor_id is not null and (since is null or e.visited_on >= since)
  ),
  touches as (
    select vid, d, at from pv
    union all select vid, d, at from le
    union all select vid, d, at from ae
  ),
  base as (
    select t.vid, min(t.at) as first_at, max(t.at) as last_at, count(distinct t.d)::int as days
    from touches t group by t.vid
  )
  select
    b.vid, b.first_at, b.last_at, b.days,
    -- Primeira origem de fora; quem só aparece vindo da própria landing é "direto".
    coalesce((select p.source from pv p where p.vid = b.vid and p.source <> 'landing' order by p.at limit 1), 'direto'),
    coalesce((select p.campaign from pv p where p.vid = b.vid and p.campaign <> '' order by p.at limit 1), ''),
    coalesce((select p.device from pv p where p.vid = b.vid and p.device <> 'desconhecido' order by p.at desc limit 1), 'desconhecido'),
    case
      when exists (select 1 from ae a where a.vid = b.vid and a.event = 'signup_ok') then 'cadastrou'
      when exists (select 1 from public.visitor_accounts va where va.visitor_id = b.vid) then 'ja_tinha_conta'
      when exists (select 1 from ae a where a.vid = b.vid and a.event = 'signup_error') then 'erro_cadastro'
      when exists (select 1 from ae a where a.vid = b.vid and a.event = 'signup_submit') then 'enviou'
      when exists (select 1 from ae a where a.vid = b.vid and a.event = 'signup_start') then 'comecou_cadastro'
      when exists (select 1 from pv p where p.vid = b.vid and p.page = 'acesso')
        or exists (select 1 from ae a where a.vid = b.vid) then 'tela_acesso'
      when exists (select 1 from le l where l.vid = b.vid and l.event = 'cta_click') then 'clicou_cta'
      else 'so_landing'
    end,
    coalesce((select a.detail from ae a where a.vid = b.vid and a.event in ('signup_error', 'login_error') order by a.at desc limit 1), '')
  from base b;
$$;

revoke execute on function public.visitor_journeys(date) from public, anon, authenticated;

-- Contagens por dimensão nos últimos `days_back` dias (null/<=0 = tudo):
--   stage          todos os navegadores, pela etapa mais avançada
--   stage_return   idem, só os que vieram em 2 dias ou mais
--   lost_days      não converteram: em quantos dias vieram (1, 2, 3-5, 6+)
--   lost_source    não converteram: primeira origem
--   lost_device    não converteram: aparelho
create or replace function public.admin_visitor_stages(days_back int default 30)
returns table (dimension text, value text, visitors bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since date := case when days_back is null or days_back <= 0 then null
                     else (now() at time zone 'America/Sao_Paulo')::date - (least(days_back, 3650) - 1) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with j as (select * from public.visitor_journeys(since)),
    lost as (select * from j where j.jv_stage not in ('cadastrou', 'ja_tinha_conta'))
    select 'stage'::text, j.jv_stage, count(*)::bigint from j group by j.jv_stage
    union all
    select 'stage_return'::text, j.jv_stage, count(*)::bigint from j where j.jv_days >= 2 group by j.jv_stage
    union all
    select 'lost_days'::text,
           case when l.jv_days <= 1 then '1' when l.jv_days = 2 then '2' when l.jv_days <= 5 then '3-5' else '6+' end,
           count(*)::bigint
    from lost l group by 2
    union all
    select 'lost_source'::text, l.jv_source, count(*)::bigint from lost l group by l.jv_source
    union all
    select 'lost_device'::text, l.jv_device, count(*)::bigint from lost l group by l.jv_device;
end;
$$;

grant execute on function public.admin_visitor_stages(int) to authenticated;

-- Os navegadores que não converteram, do acesso mais recente pro mais antigo.
-- O identificador sai encurtado (8 caracteres): serve pra diferenciar linhas,
-- não pra rastrear alguém.
create or replace function public.admin_lost_visitors(days_back int default 30, max_rows int default 50)
returns table (
  lv_visitor text, lv_first_at timestamptz, lv_last_at timestamptz, lv_days int,
  lv_source text, lv_campaign text, lv_device text, lv_stage text, lv_error text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since date := case when days_back is null or days_back <= 0 then null
                     else (now() at time zone 'America/Sao_Paulo')::date - (least(days_back, 3650) - 1) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select left(j.jv_visitor::text, 8), j.jv_first_at, j.jv_last_at, j.jv_days,
           j.jv_source, j.jv_campaign, j.jv_device, j.jv_stage, j.jv_error
    from public.visitor_journeys(since) j
    where j.jv_stage not in ('cadastrou', 'ja_tinha_conta')
    order by j.jv_last_at desc
    limit greatest(1, least(coalesce(max_rows, 50), 500));
end;
$$;

grant execute on function public.admin_lost_visitors(int, int) to authenticated;
