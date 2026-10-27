-- Sessões de uso do app (quem está logado): duração, telas abertas e aparelho.
--
-- Até aqui o painel sabia só "abriu o app" (app_access_log) e, por dia, quais
-- telas cada pessoa usou (user_events, 1 por dia). Não dava pra saber quanto
-- tempo cada visita dura, quantas vezes a pessoa volta no dia nem de quantos
-- aparelhos ela acessa.
--
-- O app abre uma sessão ao carregar (id sorteado no navegador) e manda um sinal
-- ao trocar de tela, a cada minuto com a aba visível e ao sair (track_session).
-- A duração é a diferença entre o primeiro e o último sinal. Não guarda IP,
-- modelo de aparelho nem user-agent: só conta, aparelho (o eafit_device_id que
-- já existe) e horário. Admin não conta (20261127010000_no_admin_tracking.sql).
--
-- Linhas com mais de 180 dias são apagadas por um cron diário, e as da conta
-- saem junto com ela (on delete cascade).

create table if not exists public.app_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  screens int not null default 0 check (screens between 0 and 500)
);

create index if not exists app_sessions_started_idx on public.app_sessions (started_at);
create index if not exists app_sessions_user_idx on public.app_sessions (user_id, started_at desc);

alter table public.app_sessions enable row level security;

drop policy if exists "admin reads app sessions" on public.app_sessions;
create policy "admin reads app sessions" on public.app_sessions
  for select using (public.is_admin());

-- Ninguém escreve direto: só track_session.
revoke all on public.app_sessions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Gravação: chamada pelo app logado.
-- ---------------------------------------------------------------------------
create or replace function public.track_session(p_session uuid, p_device uuid default null, p_screens int default 0)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_session is null or public.is_admin() then return; end if;

  insert into public.app_sessions as s (id, user_id, device_id, screens)
  values (p_session, auth.uid(), p_device, least(greatest(coalesce(p_screens, 0), 0), 500))
  on conflict (id) do update
    set last_seen_at = now(),
        screens = greatest(s.screens, excluded.screens)
    where s.user_id = auth.uid();
end;
$$;

revoke execute on function public.track_session(uuid, uuid, int) from public, anon;
grant execute on function public.track_session(uuid, uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Limpeza: 180 dias.
-- ---------------------------------------------------------------------------
create or replace function public.purge_old_app_sessions()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  delete from public.app_sessions where started_at < now() - interval '180 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.purge_old_app_sessions() from public, anon, authenticated;
grant execute on function public.purge_old_app_sessions() to service_role;

select cron.schedule('purge-old-app-sessions-daily', '45 6 * * *', $$ select public.purge_old_app_sessions(); $$);

-- ---------------------------------------------------------------------------
-- Painel: resumo das sessões nos últimos `days_back` dias (null/<=0 = tudo).
-- Uma linha por (dimension, value):
--   total       sessions | users | multi_device_users          -> n
--   median_s    mediana da duração em segundos                 -> n
--   avg_screens média de telas por sessão (1 casa, ×10)        -> n
--   duration    faixa de duração (<10s, 10-60s, 1-5min, 5-15min, 15min+)
--   per_user    sessões por conta (1, 2-3, 4-7, 8+)
-- A duração passa por um teto de 2 horas (aba esquecida aberta).
-- ---------------------------------------------------------------------------
create or replace function public.admin_session_stats(days_back int default 30)
returns table (dimension text, value text, n bigint)
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
    with s as (
      select a.user_id as uid, a.device_id as did, a.screens as scr,
             least(extract(epoch from (a.last_seen_at - a.started_at)), 7200)::int as secs
      from public.app_sessions a
      where since is null or (a.started_at at time zone 'America/Sao_Paulo')::date >= since
    ),
    per_user as (
      select uid, count(*)::int as sessions, count(distinct did)::int as devices from s group by uid
    )
    select 'total'::text, 'sessions'::text, count(*)::bigint from s
    union all select 'total', 'users', count(*)::bigint from per_user
    union all select 'total', 'multi_device_users', (count(*) filter (where devices >= 2))::bigint from per_user
    union all select 'median_s', '', coalesce(round(percentile_cont(0.5) within group (order by secs))::bigint, 0) from s
    union all select 'avg_screens', '', coalesce(round(avg(scr) * 10)::bigint, 0) from s
    union all select 'duration', b.band, count(*)::bigint
      from (select case when secs < 10 then '<10s' when secs < 60 then '10-60s' when secs < 300 then '1-5min'
                        when secs < 900 then '5-15min' else '15min+' end as band from s) b
      group by b.band
    union all select 'per_user', b.band, count(*)::bigint
      from (select case when sessions = 1 then '1' when sessions <= 3 then '2-3' when sessions <= 7 then '4-7'
                        else '8+' end as band from per_user) b
      group by b.band;
end;
$$;

grant execute on function public.admin_session_stats(int) to authenticated;
