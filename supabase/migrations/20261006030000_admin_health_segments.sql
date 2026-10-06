-- Saúde do sistema (jobs agendados, chamadas HTTP, push, notificações
-- automáticas, uso do banco) e segmentos salvos de usuários.
--
-- Cada indicador de saúde é uma função própria: se uma extensão/tabela de
-- sistema (cron, net) não estiver disponível no projeto, só aquele bloco da
-- tela falha — o resto continua funcionando.
--
-- Em funções com RETURNS TABLE as colunas de saída viram variáveis plpgsql,
-- então toda coluna de tabela é qualificada com alias.

-- ---------------------------------------------------------------------------
-- Jobs do pg_cron: último resultado e falhas nas últimas 24h.
-- ---------------------------------------------------------------------------
create or replace function public.admin_cron_status()
returns table (
  jobname text,
  schedule text,
  active boolean,
  last_run_at timestamptz,
  last_status text,
  last_message text,
  runs_24h bigint,
  failures_24h bigint
)
language plpgsql
security definer
set search_path = public, cron
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select j.jobname::text, j.schedule::text, j.active, lr.start_time, lr.status::text, lr.return_message::text,
           (select count(*) from cron.job_run_details d
             where d.jobid = j.jobid and d.start_time > now() - interval '24 hours'),
           (select count(*) from cron.job_run_details d
             where d.jobid = j.jobid and d.start_time > now() - interval '24 hours' and d.status = 'failed')
    from cron.job j
    left join lateral (
      select d.start_time, d.status, d.return_message
      from cron.job_run_details d
      where d.jobid = j.jobid
      order by d.start_time desc
      limit 1
    ) lr on true
    order by j.jobname;
end;
$$;

grant execute on function public.admin_cron_status() to authenticated;

-- ---------------------------------------------------------------------------
-- Respostas HTTP das Edge Functions chamadas pelo cron (pg_net). O pg_net só
-- guarda as respostas por poucas horas, então isto é um retrato recente.
-- O cron "dar certo" só significa que a chamada saiu: 401/5xx aqui é a função
-- recusando ou quebrando.
-- ---------------------------------------------------------------------------
create or replace function public.admin_http_health()
returns table (status_group text, total bigint, last_at timestamptz, sample text)
language plpgsql
security definer
set search_path = public, net
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select case
             when r.timed_out then 'timeout'
             when r.status_code is null then 'sem resposta'
             when r.status_code between 200 and 299 then '2xx'
             when r.status_code = 401 then '401'
             when r.status_code between 400 and 499 then '4xx'
             when r.status_code >= 500 then '5xx'
             else 'outro'
           end,
           count(*)::bigint,
           max(r.created),
           left((array_agg(coalesce(r.error_msg, r.content) order by r.created desc))[1], 200)
    from net._http_response r
    where r.created > now() - interval '24 hours'
    group by 1
    order by 1;
end;
$$;

grant execute on function public.admin_http_health() to authenticated;

-- ---------------------------------------------------------------------------
-- Alcance do push: usuários com push ativo e distribuição por provedor.
-- ---------------------------------------------------------------------------
create or replace function public.admin_push_health()
returns table (total_users bigint, users_with_push bigint, subs_total bigint, hosts jsonb)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select
      (select count(*) from auth.users u
         left join public.profiles p on p.id = u.id
         where not coalesce(p.is_admin, false)),
      (select count(distinct ps.user_id) from public.push_subscriptions ps),
      (select count(*) from public.push_subscriptions),
      coalesce((
        select jsonb_object_agg(h.host, h.n)
        from (
          select coalesce(substring(ps.endpoint from 'https?://([^/]+)'), 'desconhecido') as host, count(*) as n
          from public.push_subscriptions ps
          group by 1
        ) h
      ), '{}'::jsonb);
end;
$$;

grant execute on function public.admin_push_health() to authenticated;

-- ---------------------------------------------------------------------------
-- Notificações automáticas: última execução e volume por tipo.
-- ---------------------------------------------------------------------------
create or replace function public.admin_notification_activity()
returns table (
  kind text,
  label text,
  enabled boolean,
  send_hour smallint,
  last_sent_at timestamptz,
  sent_24h bigint,
  sent_7d bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select r.kind, r.label, r.enabled, r.send_hour,
           (select max(l.created_at) from public.notification_log l where l.kind = r.kind),
           (select count(*) from public.notification_log l where l.kind = r.kind and l.created_at > now() - interval '24 hours'),
           (select count(*) from public.notification_log l where l.kind = r.kind and l.created_at > now() - interval '7 days')
    from public.engagement_rules r
    order by r.priority;
end;
$$;

grant execute on function public.admin_notification_activity() to authenticated;

-- ---------------------------------------------------------------------------
-- Uso do banco: tamanho total (linha '__total__') e maiores tabelas.
-- ---------------------------------------------------------------------------
create or replace function public.admin_db_usage()
returns table (table_name text, size_bytes bigint, est_rows bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    (select '__total__'::text, pg_database_size(current_database())::bigint, 0::bigint)
    union all
    (select c.relname::text, pg_total_relation_size(c.oid)::bigint, greatest(c.reltuples, 0)::bigint
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
     order by pg_total_relation_size(c.oid) desc
     limit 8);
end;
$$;

grant execute on function public.admin_db_usage() to authenticated;

-- ---------------------------------------------------------------------------
-- Segmentos salvos: filtros da lista de Usuários guardados com um nome.
-- filters = { search, status, nivel, meta } (mesmos parâmetros de
-- admin_list_users_page).
-- ---------------------------------------------------------------------------
create table if not exists public.user_segments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  description text not null default '',
  filters jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.user_segments enable row level security;

drop policy if exists "admin full access" on public.user_segments;
create policy "admin full access" on public.user_segments
  for all using (public.is_admin()) with check (public.is_admin());
