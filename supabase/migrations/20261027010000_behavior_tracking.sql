-- Comportamento de visitantes e usuários no painel admin (Análises →
-- Comportamento).
--
-- Visitante (anônimo, mesma filosofia de page_visits: sem usuário, IP,
-- user-agent ou cookie — só categorias curtas escolhidas pelo navegador):
--   * page_visits ganha navegador, tipo de aparelho, idioma e campanha
--   * auth_events: onde o cadastro/login trava (começou, enviou, erro, criou)
--
-- Usuário logado (ligado à conta — consta na política de privacidade e some
-- junto com a conta, on delete cascade):
--   * user_events: uma linha por usuário, dia, evento e detalhe (telas abertas,
--     funcionalidades usadas, etapas do onboarding, abertura por notificação)
--   * user_client: retrato do último acesso (sistema, navegador, aparelho,
--     instalado ou navegador, versão do app, idioma, permissão de push)
--
-- Quem grava: app-react/src/lib/tracking.js e o <script> da landing. Tudo é
-- gravado por RPC/insert que falha em silêncio: métrica nunca atrapalha o app.
--
-- Em funções com RETURNS TABLE as colunas de saída viram variáveis plpgsql,
-- então toda coluna de tabela é qualificada com alias.

-- ---------------------------------------------------------------------------
-- 1. Visitas: navegador, aparelho, idioma e campanha
-- ---------------------------------------------------------------------------
alter table public.page_visits
  add column if not exists browser text not null default 'desconhecido',
  add column if not exists device text not null default 'desconhecido',
  add column if not exists lang text not null default 'desconhecido',
  add column if not exists campaign text not null default '';

alter table public.page_visits drop constraint if exists page_visits_browser_check;
alter table public.page_visits add constraint page_visits_browser_check
  check (browser in ('chrome', 'safari', 'firefox', 'edge', 'samsung', 'opera', 'outro', 'desconhecido'));

alter table public.page_visits drop constraint if exists page_visits_device_check;
alter table public.page_visits add constraint page_visits_device_check
  check (device in ('celular', 'tablet', 'desktop', 'desconhecido'));

alter table public.page_visits drop constraint if exists page_visits_lang_check;
alter table public.page_visits add constraint page_visits_lang_check
  check (lang in ('pt', 'en', 'outro', 'desconhecido'));

alter table public.page_visits drop constraint if exists page_visits_campaign_check;
alter table public.page_visits add constraint page_visits_campaign_check
  check (campaign ~ '^[a-z0-9_-]{0,40}$');

grant insert (page, source, os, browser, device, lang, campaign) on public.page_visits to anon, authenticated;

-- Visitas por dimensão nos últimos `days_back` dias (null/<=0 = tudo).
-- dimension = browser | device | lang | campaign | hour (00–23, Brasília) |
-- weekday (0 = domingo … 6 = sábado).
create or replace function public.admin_visit_breakdown(days_back int default 30)
returns table (dimension text, value text, visits bigint)
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
    with v as (
      select pv.browser as b, pv.device as d, pv.lang as l, pv.campaign as c,
             (pv.created_at at time zone 'America/Sao_Paulo') as local_ts
      from public.page_visits pv
      where since is null or pv.visited_on >= since
    )
    select 'browser'::text, v.b, count(*)::bigint from v group by v.b
    union all
    select 'device'::text, v.d, count(*)::bigint from v group by v.d
    union all
    select 'lang'::text, v.l, count(*)::bigint from v group by v.l
    union all
    select 'campaign'::text, v.c, count(*)::bigint from v where v.c <> '' group by v.c
    union all
    select 'hour'::text, to_char(v.local_ts, 'HH24'), count(*)::bigint from v group by 2
    union all
    select 'weekday'::text, extract(dow from v.local_ts)::int::text, count(*)::bigint from v group by 2;
end;
$$;

grant execute on function public.admin_visit_breakdown(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Eventos anônimos da tela de acesso (cadastro e login)
--   signup_start   começou a preencher o cadastro
--   signup_submit  tentou enviar o cadastro
--   signup_error   detail = motivo (termos, senha_curta, code do Supabase Auth…)
--   signup_ok      conta criada
--   login_error    detail = motivo
-- O app deduplica por sessão do navegador (1 registro por evento+detalhe).
-- ---------------------------------------------------------------------------
create table if not exists public.auth_events (
  id bigint generated always as identity primary key,
  visited_on date not null default (now() at time zone 'America/Sao_Paulo')::date,
  event text not null check (event in ('signup_start', 'signup_submit', 'signup_error', 'signup_ok', 'login_error')),
  detail text not null default '' check (detail ~ '^[a-z0-9_-]{0,40}$'),
  created_at timestamptz not null default now()
);

create index if not exists auth_events_visited_on_idx on public.auth_events (visited_on);

alter table public.auth_events enable row level security;

drop policy if exists "anyone can record an auth event" on public.auth_events;
create policy "anyone can record an auth event" on public.auth_events
  for insert to anon, authenticated
  with check (visited_on = (now() at time zone 'America/Sao_Paulo')::date);

drop policy if exists "admin reads auth events" on public.auth_events;
create policy "admin reads auth events" on public.auth_events
  for select using (public.is_admin());

revoke all on public.auth_events from anon, authenticated;
grant insert (event, detail) on public.auth_events to anon, authenticated;

-- Mesmo teto diário das outras tabelas de inserção anônima
-- (20261023030000_anon_insert_daily_cap.sql).
drop trigger if exists auth_events_daily_cap on public.auth_events;
create trigger auth_events_daily_cap
  before insert on public.auth_events
  for each row execute function public.enforce_daily_insert_cap(20000);

create or replace function public.admin_auth_events(days_back int default 30)
returns table (event text, detail text, total bigint)
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
    select e.event, e.detail, count(*)::bigint
    from public.auth_events e
    where since is null or e.visited_on >= since
    group by e.event, e.detail
    order by count(*) desc, e.event, e.detail;
end;
$$;

grant execute on function public.admin_auth_events(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Eventos do usuário logado: no máximo 1 linha por usuário/dia/evento/detalhe
--   page        detail = aba aberta (treino, historico, hidratacao, dash, perfil…)
--   feature     detail = funcionalidade usada (live_mode, voice_coach, water…)
--   onboarding  detail = etapa (view, sexo, idade, peso, altura, submit, erro_*, done)
--   push        detail = open (abriu o app por uma notificação)
-- ---------------------------------------------------------------------------
create table if not exists public.user_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default (now() at time zone 'America/Sao_Paulo')::date,
  event text not null check (event ~ '^[a-z0-9_]{1,30}$'),
  detail text not null default '' check (detail ~ '^[a-z0-9_-]{0,40}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, day, event, detail)
);

create index if not exists user_events_day_idx on public.user_events (day);

alter table public.user_events enable row level security;

drop policy if exists "admin reads user events" on public.user_events;
create policy "admin reads user events" on public.user_events
  for select using (public.is_admin());

-- Ninguém escreve direto: só pela função abaixo, que fixa usuário e dia.
revoke all on public.user_events from anon, authenticated;

create or replace function public.track_event(p_event text, p_detail text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  if p_event is null or p_event !~ '^[a-z0-9_]{1,30}$' then return; end if;
  if coalesce(p_detail, '') !~ '^[a-z0-9_-]{0,40}$' then return; end if;

  insert into public.user_events (user_id, event, detail)
  values (auth.uid(), p_event, coalesce(p_detail, ''))
  on conflict do nothing;
end;
$$;

revoke execute on function public.track_event(text, text) from public, anon;
grant execute on function public.track_event(text, text) to authenticated;

-- Usuários distintos e dias de uso por evento/detalhe no período. A linha
-- ('__active__', '') traz quantos usuários tiveram qualquer evento — base do
-- "% dos usuários ativos". Sem admins (contas de teste/operação).
create or replace function public.admin_user_events(days_back int default 30)
returns table (event text, detail text, users bigint, days bigint)
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
    with ev as (
      select e.user_id as uid, e.event as ev, e.detail as dt
      from public.user_events e
      left join public.profiles p on p.id = e.user_id
      where (since is null or e.day >= since) and not coalesce(p.is_admin, false)
    )
    select ev.ev, ev.dt, count(distinct ev.uid)::bigint, count(*)::bigint
    from ev group by ev.ev, ev.dt
    union all
    select '__active__'::text, ''::text, count(distinct ev.uid)::bigint, count(*)::bigint from ev;
end;
$$;

grant execute on function public.admin_user_events(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Retrato do último acesso de cada usuário
-- ---------------------------------------------------------------------------
create table if not exists public.user_client (
  user_id uuid primary key references auth.users(id) on delete cascade,
  os text not null default 'outro' check (os in ('android', 'ios', 'windows', 'mac', 'linux', 'outro')),
  browser text not null default 'outro' check (browser in ('chrome', 'safari', 'firefox', 'edge', 'samsung', 'opera', 'outro')),
  device text not null default 'desktop' check (device in ('celular', 'tablet', 'desktop')),
  display_mode text not null default 'browser' check (display_mode in ('standalone', 'browser')),
  app_version text not null default '' check (app_version ~ '^[0-9a-z.+-]{0,20}$'),
  lang text not null default 'pt' check (lang in ('pt', 'en', 'outro')),
  push_permission text not null default 'default' check (push_permission in ('granted', 'denied', 'default', 'unsupported')),
  last_seen date not null default (now() at time zone 'America/Sao_Paulo')::date,
  updated_at timestamptz not null default now()
);

alter table public.user_client enable row level security;

drop policy if exists "admin reads user client" on public.user_client;
create policy "admin reads user client" on public.user_client
  for select using (public.is_admin());

revoke all on public.user_client from anon, authenticated;

-- Valor fora da lista vira o padrão da categoria em vez de derrubar a gravação.
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
begin
  if auth.uid() is null then return; end if;

  insert into public.user_client as c
    (user_id, os, browser, device, display_mode, app_version, lang, push_permission)
  values (auth.uid(), v_os, v_browser, v_device, v_mode, v_version, v_lang, v_push)
  on conflict (user_id) do update set
    os = excluded.os, browser = excluded.browser, device = excluded.device,
    display_mode = excluded.display_mode, app_version = excluded.app_version,
    lang = excluded.lang, push_permission = excluded.push_permission,
    last_seen = (now() at time zone 'America/Sao_Paulo')::date, updated_at = now();
end;
$$;

revoke execute on function public.track_client(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.track_client(text, text, text, text, text, text, text) to authenticated;

-- Usuários por dimensão entre os vistos nos últimos `days_back` dias
-- (null/<=0 = todos). dimension = os | browser | device | display_mode |
-- app_version | lang | push_permission. Sem admins.
create or replace function public.admin_client_breakdown(days_back int default 30)
returns table (dimension text, value text, users bigint)
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
    with c as (
      select uc.os as o, uc.browser as b, uc.device as d, uc.display_mode as m,
             uc.app_version as v, uc.lang as l, uc.push_permission as pp
      from public.user_client uc
      left join public.profiles p on p.id = uc.user_id
      where (since is null or uc.last_seen >= since) and not coalesce(p.is_admin, false)
    )
    select 'os'::text, c.o, count(*)::bigint from c group by c.o
    union all
    select 'browser'::text, c.b, count(*)::bigint from c group by c.b
    union all
    select 'device'::text, c.d, count(*)::bigint from c group by c.d
    union all
    select 'display_mode'::text, c.m, count(*)::bigint from c group by c.m
    union all
    select 'app_version'::text, c.v, count(*)::bigint from c group by c.v
    union all
    select 'lang'::text, c.l, count(*)::bigint from c group by c.l
    union all
    select 'push_permission'::text, c.pp, count(*)::bigint from c group by c.pp;
end;
$$;

grant execute on function public.admin_client_breakdown(int) to authenticated;

-- App instalado × navegador: quantos usuários em cada modo e quantos deles
-- treinaram nos últimos 7 dias (training_days() = definição única de "treinou").
create or replace function public.admin_install_retention()
returns table (display_mode text, users bigint, trained_7d bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with recent as (
      select distinct t.user_id as uid from public.training_days() t where t.day >= today - 6
    )
    select uc.display_mode, count(*)::bigint, count(r.uid)::bigint
    from public.user_client uc
    left join public.profiles p on p.id = uc.user_id
    left join recent r on r.uid = uc.user_id
    where not coalesce(p.is_admin, false)
    group by uc.display_mode;
end;
$$;

grant execute on function public.admin_install_retention() to authenticated;

-- Retrato de um usuário (ficha do usuário no painel).
create or replace function public.admin_user_client(target uuid)
returns table (
  os text, browser text, device text, display_mode text, app_version text,
  lang text, push_permission text, last_seen date
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select uc.os, uc.browser, uc.device, uc.display_mode, uc.app_version,
           uc.lang, uc.push_permission, uc.last_seen
    from public.user_client uc
    where uc.user_id = target;
end;
$$;

grant execute on function public.admin_user_client(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Treinos iniciados × concluídos
-- "Iniciado" = tem horário de início, foi concluído/finalizado ou tem ao menos
-- uma série feita (o app cria a linha de workouts ao abrir a semana, então a
-- linha sozinha não conta). O dia de hoje fica fora: treino em andamento não
-- é abandono. Sem admins.
-- ---------------------------------------------------------------------------
create or replace function public.admin_workout_completion(days_back int default 30)
returns table (started bigint, completed bigint, avg_duration_seconds int, median_duration_seconds int)
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  since date := case when days_back is null or days_back <= 0 then null else today - days_back end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with w as (
      select wk.id as wid,
             (wk.completed or wk.finished_at is not null) as done,
             wk.duration_seconds as dur
      from public.workouts wk
      left join public.profiles p on p.id = wk.user_id
      where wk.workout_date < today
        and (since is null or wk.workout_date >= since)
        and not coalesce(p.is_admin, false)
        and (
          wk.completed or wk.started_at is not null or wk.finished_at is not null
          or exists (select 1 from public.exercise_sets es where es.workout_id = wk.id and es.completed)
        )
    )
    select
      count(*)::bigint,
      count(*) filter (where w.done)::bigint,
      -- Durações plausíveis (1 min a 4 h): cronômetro esquecido ligado não entra.
      (avg(w.dur) filter (where w.done and w.dur between 60 and 14400))::int,
      (percentile_cont(0.5) within group (order by w.dur) filter (where w.done and w.dur between 60 and 14400))::int
    from w;
end;
$$;

grant execute on function public.admin_workout_completion(int) to authenticated;

-- Nos treinos iniciados e não concluídos, o último exercício com série feita:
-- é onde a pessoa parou.
create or replace function public.admin_workout_dropoff(days_back int default 30, max_rows int default 10)
returns table (exercise_name text, total bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  since date := case when days_back is null or days_back <= 0 then null else today - days_back end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with last_set as (
      select distinct on (es.workout_id) es.workout_id as wid, es.exercise_name as ex
      from public.exercise_sets es
      join public.workouts wk on wk.id = es.workout_id
      left join public.profiles p on p.id = wk.user_id
      where es.completed
        and wk.workout_date < today
        and (since is null or wk.workout_date >= since)
        and not wk.completed and wk.finished_at is null
        and not coalesce(p.is_admin, false)
      order by es.workout_id, es.updated_at desc
    )
    select ls.ex, count(*)::bigint
    from last_set ls
    group by ls.ex
    order by count(*) desc, ls.ex
    limit greatest(1, least(coalesce(max_rows, 10), 50));
end;
$$;

grant execute on function public.admin_workout_dropoff(int, int) to authenticated;
