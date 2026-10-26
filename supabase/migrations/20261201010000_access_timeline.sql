-- Acessos por dia, hora e minuto no painel (Análises → Comportamento →
-- "Acessos no tempo").
--
-- Até aqui o painel sabia o HORÁRIO só das visitas anônimas (page_visits.created_at)
-- e, de quem está logado, apenas o DIA (app_access_days, 1 linha por dia).
-- app_access_log guarda cada abertura do app com o horário, sem IP, aparelho
-- ou qualquer outro dado: só quem e quando. Quem grava é track_access (o app
-- chama 1 vez por sessão do navegador); no máximo 1 linha a cada 5 minutos por
-- conta, pra tabela não crescer à toa. Admin não conta (mesma regra de
-- 20261127010000_no_admin_tracking.sql).
--
-- Linhas com mais de 180 dias são apagadas por um cron diário, e as da conta
-- saem junto com ela (on delete cascade).

create table if not exists public.app_access_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  accessed_at timestamptz not null default now()
);

create index if not exists app_access_log_at_idx on public.app_access_log (accessed_at);
create index if not exists app_access_log_user_idx on public.app_access_log (user_id, accessed_at desc);

alter table public.app_access_log enable row level security;

drop policy if exists "admin reads app access log" on public.app_access_log;
create policy "admin reads app access log" on public.app_access_log
  for select using (public.is_admin());

-- Ninguém escreve direto: só track_access.
revoke all on public.app_access_log from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Gravação: chamada pelo app logado.
-- ---------------------------------------------------------------------------
create or replace function public.track_access()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then return; end if;

  if exists (
    select 1 from public.app_access_log l
    where l.user_id = auth.uid() and l.accessed_at > now() - interval '5 minutes'
  ) then
    return;
  end if;

  insert into public.app_access_log (user_id) values (auth.uid());
end;
$$;

revoke execute on function public.track_access() from public, anon;
grant execute on function public.track_access() to authenticated;

-- ---------------------------------------------------------------------------
-- Limpeza: 180 dias.
-- ---------------------------------------------------------------------------
create or replace function public.purge_old_access_log()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  delete from public.app_access_log where accessed_at < now() - interval '180 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.purge_old_access_log() from public, anon, authenticated;
grant execute on function public.purge_old_access_log() to service_role;

select cron.schedule('purge-old-access-log-daily', '40 6 * * *', $$ select public.purge_old_access_log(); $$);

-- ---------------------------------------------------------------------------
-- Painel: linha do tempo de acessos, por 'dia', 'hora' ou 'minuto' (Brasília).
-- p_buckets = quantos intervalos olhar pra trás, contando o atual (limitado:
-- 90 dias, 168 horas, 240 minutos). Intervalos sem acesso vêm com zero.
--   site_visits  = visitas anônimas à landing e à tela de acesso
--   app_accesses = aberturas do app por quem está logado
--   app_users    = contas distintas que abriram o app no intervalo
-- Dias antes desta migration: app_accesses vem de app_access_days (1 por conta
-- por dia, sem horário), então só o filtro por dia é completo no histórico.
-- ---------------------------------------------------------------------------
create or replace function public.admin_access_timeline(p_bucket text default 'dia', p_buckets int default 30)
returns table (bucket_at timestamp, site_visits bigint, app_accesses bigint, app_users bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  unit text := case p_bucket when 'minuto' then 'minute' when 'hora' then 'hour' else 'day' end;
  step interval := case p_bucket when 'minuto' then interval '1 minute' when 'hora' then interval '1 hour' else interval '1 day' end;
  n int := least(greatest(coalesce(p_buckets, 30), 1),
                 case p_bucket when 'minuto' then 240 when 'hora' then 168 else 90 end);
  local_now timestamp := now() at time zone 'America/Sao_Paulo';
  first_bucket timestamp := date_trunc(unit, local_now) - (n - 1) * step;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with series as (
      select g as b from generate_series(first_bucket, date_trunc(unit, local_now), step) g
    ),
    site as (
      select date_trunc(unit, v.created_at at time zone 'America/Sao_Paulo') as b, count(*)::bigint as n
      from public.page_visits v
      where v.created_at >= first_bucket at time zone 'America/Sao_Paulo'
      group by 1
    ),
    -- Aberturas com horário (log novo) + dias antigos só com data (sem horário,
    -- só entram na visão por dia e apenas antes do log existir).
    app as (
      select date_trunc(unit, l.accessed_at at time zone 'America/Sao_Paulo') as b,
             count(*)::bigint as n, count(distinct l.user_id)::bigint as u
      from public.app_access_log l
      where l.accessed_at >= first_bucket at time zone 'America/Sao_Paulo'
      group by 1
    ),
    legacy as (
      select d.day::timestamp as b, count(*)::bigint as n, count(*)::bigint as u
      from public.app_access_days d
      where unit = 'day'
        and d.day::timestamp >= first_bucket
        and not exists (
          select 1 from public.app_access_log l
          where l.user_id = d.user_id
            and (l.accessed_at at time zone 'America/Sao_Paulo')::date = d.day
        )
      group by 1
    )
    select s.b,
           coalesce(site.n, 0),
           coalesce(app.n, 0) + coalesce(legacy.n, 0),
           coalesce(app.u, 0) + coalesce(legacy.u, 0)
    from series s
    left join site on site.b = s.b
    left join app on app.b = s.b
    left join legacy on legacy.b = s.b
    order by s.b;
end;
$$;

grant execute on function public.admin_access_timeline(text, int) to authenticated;
