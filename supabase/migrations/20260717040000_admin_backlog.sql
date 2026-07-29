-- Segunda leva de backlog do backoffice: paginação/filtro em Usuários e
-- Auditoria, métricas de retenção/engajamento no Dashboard, visão
-- consolidada de dor/lesão entre usuários (Segurança) e infraestrutura de
-- notificação agendada.

-- admin_list_users() (sem args) continua existindo intocada — é usada pela
-- lista de destinatários do Broadcast, que precisa da base inteira, não de
-- uma página. A tela de Usuários passa a usar esta versão paginada/filtrável.
create or replace function public.admin_list_users_page(
  search text default null,
  status_filter text default null, -- 'admin' | 'banned' | 'unconfirmed' | 'active' | null (todos)
  page_size int default 50,
  page_offset int default 0
)
returns table (
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  is_admin boolean,
  total_count bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  return query
    with base as (
      select u.id, u.email::text as email, u.created_at, u.last_sign_in_at, u.email_confirmed_at,
             u.banned_until, coalesce(p.is_admin, false) as is_admin
      from auth.users u
      left join public.profiles p on p.id = u.id
      where (search is null or search = '' or u.email ilike '%' || search || '%')
        and (
          status_filter is null
          or (status_filter = 'admin' and coalesce(p.is_admin, false))
          or (status_filter = 'banned' and u.banned_until is not null and u.banned_until > now())
          or (status_filter = 'unconfirmed' and u.email_confirmed_at is null)
          or (status_filter = 'active' and not coalesce(p.is_admin, false)
              and (u.banned_until is null or u.banned_until <= now())
              and u.email_confirmed_at is not null)
        )
    )
    select b.*, count(*) over()::bigint as total_count
    from base b
    order by b.created_at desc
    limit page_size offset page_offset;
end;
$$;

grant execute on function public.admin_list_users_page(text, text, int, int) to authenticated;

-- admin_list_audit_log() trocou de assinatura (0 args -> paginado) — precisa
-- dropar a versão antiga antes, "create or replace" não troca lista de args.
drop function if exists public.admin_list_audit_log();

create function public.admin_list_audit_log(page_size int default 50, page_offset int default 0)
returns table (
  id uuid,
  created_at timestamptz,
  admin_email text,
  target_email text,
  action text,
  details jsonb,
  total_count bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  return query
    select l.id, l.created_at, a.email::text, t.email::text, l.action, l.details,
           count(*) over()::bigint as total_count
    from public.admin_audit_log l
    left join auth.users a on a.id = l.admin_id
    left join auth.users t on t.id = l.target_user_id
    order by l.created_at desc
    limit page_size offset page_offset;
end;
$$;

grant execute on function public.admin_list_audit_log(int, int) to authenticated;

-- admin_dashboard_stats() ganhou colunas novas — "create or replace" não
-- muda o formato de retorno de uma function RETURNS TABLE, precisa dropar.
drop function if exists public.admin_dashboard_stats();

create function public.admin_dashboard_stats()
returns table (
  total_users bigint,
  users_last_7d bigint,
  users_last_30d bigint,
  confirmed_users bigint,
  banned_users bigint,
  admins_count bigint,
  total_workouts bigint,
  workouts_last_7d bigint,
  total_food_logs bigint,
  active_users_7d bigint,
  push_enabled_users bigint,
  severe_discomfort_30d bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select
      (select count(*) from auth.users),
      (select count(*) from auth.users where created_at >= now() - interval '7 days'),
      (select count(*) from auth.users where created_at >= now() - interval '30 days'),
      (select count(*) from auth.users where email_confirmed_at is not null),
      (select count(*) from auth.users where banned_until is not null and banned_until > now()),
      (select count(*) from public.profiles where is_admin),
      (select count(*) from public.workouts),
      (select count(*) from public.workouts where created_at >= now() - interval '7 days'),
      (select count(*) from public.food_logs),
      (select count(distinct user_id) from (
        select user_id from public.workouts where created_at >= now() - interval '7 days'
        union
        select user_id from public.food_logs where created_at >= now() - interval '7 days'
      ) recent),
      (select count(distinct user_id) from public.push_subscriptions),
      (select count(*) from public.exercise_discomfort
         where severity in ('forte', 'lesao') and log_date >= current_date - interval '30 days');
end;
$$;

grant execute on function public.admin_dashboard_stats() to authenticated;

-- Visão "Segurança": relatos de dor/desconforto entre TODOS os usuários, não
-- só o que já dá pra ver abrindo usuário por usuário no UserDetail. Por
-- padrão só severidade forte/lesão, pra dar sinal de risco sem ruído dos
-- relatos leves/moderados (que continuam só no perfil de cada usuário).
create or replace function public.admin_list_discomfort(
  only_severe boolean default true,
  page_size int default 50,
  page_offset int default 0
)
returns table (
  id bigint,
  user_id uuid,
  user_email text,
  exercise_name text,
  log_date date,
  severity text,
  note text,
  total_count bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with base as (
      select d.id, d.user_id, u.email::text as user_email, d.exercise_name, d.log_date, d.severity, d.note
      from public.exercise_discomfort d
      join auth.users u on u.id = d.user_id
      where (not only_severe or d.severity in ('forte', 'lesao'))
    )
    select b.*, count(*) over()::bigint as total_count
    from base b
    order by b.log_date desc
    limit page_size offset page_offset;
end;
$$;

grant execute on function public.admin_list_discomfort(boolean, int, int) to authenticated;

-- Notificações agendadas do Broadcast (app-admin). Só o admin mexe nessa
-- tabela — a Edge Function send-scheduled-broadcast (cron, service role)
-- é quem efetivamente processa e marca sent_at.
create table if not exists public.scheduled_broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  target_user_ids uuid[],
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  sent_count int,
  target_count int,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.scheduled_broadcasts enable row level security;

drop policy if exists "admin full access" on public.scheduled_broadcasts;
create policy "admin full access" on public.scheduled_broadcasts
  for all using (public.is_admin()) with check (public.is_admin());

-- Pré-requisito: implantar a Edge Function send-scheduled-broadcast
-- (dashboard → Edge Functions → New function, colar o código de
-- supabase/functions/send-scheduled-broadcast/index.ts) e desativar
-- "Verify JWT" nela — mesmo padrão de send-reminders, chamada só pelo cron,
-- sem usuário logado.
select cron.schedule(
  'send-scheduled-broadcasts-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://btzdetvoneyhzthsmdrp.supabase.co/functions/v1/send-scheduled-broadcast',
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);
