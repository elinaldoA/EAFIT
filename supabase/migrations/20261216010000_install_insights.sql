-- Dashboard → Instalações: comparação com o período anterior, retenção do app
-- instalado, navegador, origem de quem instalou e as listas de instalações
-- recentes e de quem parou de abrir. Tudo sem admins e só leitura.

-- Período anterior, do mesmo tamanho (a tela compara com o atual).
create or replace function public.admin_install_compare(days_back int default 30)
returns table (
  screen_shown bigint, prompt_accepted bigint, prompt_dismissed bigint,
  installs bigint, first_opens bigint, push_stale bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  n int := greatest(1, least(coalesce(days_back, 30), 366));
  from_day date := today - (2 * n - 1);
  to_day date := today - n;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with a as (
      select i.*
      from public.app_installs i
      left join public.profiles p on p.id = i.user_id
      where not coalesce(p.is_admin, false)
    )
    select
      count(*) filter (where (a.screen_shown_at at time zone 'America/Sao_Paulo')::date between from_day and to_day),
      count(*) filter (where a.prompt_answer = 'accepted' and (a.prompt_answer_at at time zone 'America/Sao_Paulo')::date between from_day and to_day),
      count(*) filter (where a.prompt_answer = 'dismissed' and (a.prompt_answer_at at time zone 'America/Sao_Paulo')::date between from_day and to_day),
      count(*) filter (where a.install_source <> 'anterior' and (a.installed_at at time zone 'America/Sao_Paulo')::date between from_day and to_day),
      count(*) filter (where a.install_source <> 'anterior' and (a.first_open_at at time zone 'America/Sao_Paulo')::date between from_day and to_day),
      (select count(*) from public.push_stale_log l
         left join public.profiles p on p.id = l.user_id
         where not coalesce(p.is_admin, false)
           and (l.detected_at at time zone 'America/Sao_Paulo')::date between from_day and to_day)
    from a;
end;
$$;

revoke execute on function public.admin_install_compare(int) from public, anon;
grant execute on function public.admin_install_compare(int) to authenticated;

-- Retenção. kind 'return': das instalações novas do período com idade mínima
-- de `bucket` dias (1, 7, 30), quantas ainda abriam o app `bucket` dias ou mais
-- depois de instalar (total) em relação às que já têm essa idade (base).
-- kind 'days': dos instalados, quantos abriram pelo ícone em 0, 1, 2-3, 4-7,
-- 8-15 e 16+ dias (bucket = início da faixa).
create or replace function public.admin_install_retention(days_back int default 30)
returns table (kind text, bucket int, total bigint, base bigint)
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
      select i.install_source, i.open_days, i.last_open_on,
             (i.installed_at at time zone 'America/Sao_Paulo')::date as inst_day
      from public.app_installs i
      left join public.profiles p on p.id = i.user_id
      where not coalesce(p.is_admin, false) and i.installed_at is not null
    ),
    fresh as (
      select * from a where a.install_source <> 'anterior' and (since is null or a.inst_day >= since)
    )
    select 'return'::text, b.n,
           (select count(*) from fresh f where f.inst_day <= today - b.n and f.last_open_on >= f.inst_day + b.n),
           (select count(*) from fresh f where f.inst_day <= today - b.n)
    from (values (1), (7), (30)) b(n)
    union all
    select 'days'::text, b.n,
           (select count(*) from a where a.open_days >= b.n and a.open_days < b.nx),
           (select count(*) from a)
    from (values (0, 1), (1, 2), (2, 4), (4, 8), (8, 16), (16, 100000)) b(n, nx)
    order by 1 desc, 2;
end;
$$;

revoke execute on function public.admin_install_retention(int) from public, anon;
grant execute on function public.admin_install_retention(int) to authenticated;

-- Por navegador (mesmas colunas de admin_install_by_os).
create or replace function public.admin_install_by_browser(days_back int default 30)
returns table (browser text, installed_total bigint, installs bigint, active_30d bigint)
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
    select i.browser,
           count(*),
           count(*) filter (where i.install_source <> 'anterior'
             and (since is null or (i.installed_at at time zone 'America/Sao_Paulo')::date >= since)),
           count(*) filter (where i.last_open_on >= today - 29)
    from public.app_installs i
    left join public.profiles p on p.id = i.user_id
    where not coalesce(p.is_admin, false) and i.installed_at is not null
    group by i.browser
    order by 2 desc, 1;
end;
$$;

revoke execute on function public.admin_install_by_browser(int) from public, anon;
grant execute on function public.admin_install_by_browser(int) to authenticated;

-- Origem de quem instalou: a mesma origem do cadastro (utm ou link de
-- embaixador). Aparelho sem conta vira 'sem_conta'.
create or replace function public.admin_install_by_origin(days_back int default 30)
returns table (source text, installs bigint, active_30d bigint)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  since date := case when days_back is null or days_back <= 0 then null else today - (days_back - 1) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select case when i.user_id is null then 'sem_conta'
                else coalesce(nullif(u.raw_user_meta_data->'utm'->>'source', ''), nullif(u.raw_user_meta_data->>'refSource', ''), 'sem_origem') end,
           count(*),
           count(*) filter (where i.last_open_on >= today - 29)
    from public.app_installs i
    left join auth.users u on u.id = i.user_id
    left join public.profiles p on p.id = i.user_id
    where not coalesce(p.is_admin, false) and i.installed_at is not null and i.install_source <> 'anterior'
      and (since is null or (i.installed_at at time zone 'America/Sao_Paulo')::date >= since)
    group by 1
    order by 2 desc, 1;
end;
$$;

revoke execute on function public.admin_install_by_origin(int) from public, anon;
grant execute on function public.admin_install_by_origin(int) to authenticated;

-- Listas de aparelhos. 'recent' = últimas instalações novas; 'inactive' =
-- instalados que não abrem pelo ícone há 30+ dias (os que abriram há menos
-- tempo ficam de fora), do último acesso mais recente pro mais antigo.
create or replace function public.admin_install_devices(p_kind text default 'recent', max_rows int default 20)
returns table (
  installed_at timestamptz, os text, browser text, install_source text, open_days int,
  last_open_on date, user_id uuid, email text, nome text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select i.installed_at, i.os, i.browser, i.install_source, i.open_days, i.last_open_on, i.user_id, u.email::text,
           coalesce(nullif(u.raw_user_meta_data->>'nome', ''), nullif(u.raw_user_meta_data->>'name', ''))::text
    from public.app_installs i
    left join auth.users u on u.id = i.user_id
    left join public.profiles p on p.id = i.user_id
    where not coalesce(p.is_admin, false) and i.installed_at is not null
      and case when p_kind = 'inactive'
               then coalesce(i.last_open_on, (i.installed_at at time zone 'America/Sao_Paulo')::date) < today - 29
               else i.install_source <> 'anterior' end
    order by case when p_kind = 'inactive' then coalesce(i.last_open_on, (i.installed_at at time zone 'America/Sao_Paulo')::date) end desc nulls last,
             i.installed_at desc
    limit greatest(1, least(coalesce(max_rows, 20), 200));
end;
$$;

revoke execute on function public.admin_install_devices(text, int) from public, anon;
grant execute on function public.admin_install_devices(text, int) to authenticated;
