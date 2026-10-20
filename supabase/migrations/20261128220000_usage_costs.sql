-- Custos e uso (Sistema → Custos). O que dá para medir de dentro do banco:
-- tamanho do banco, arquivos no Storage, contas, usuários ativos no mês (MAU,
-- pelos dias de acesso do app) e aparelhos com push. Um retrato por dia fica em
-- usage_snapshots (cron 6h) para ver a tendência e prever quando cada cota
-- estoura. Plano, cotas e preços ficam em app_settings 'cost_plan' (editáveis
-- no painel; conferir em supabase.com/pricing). Tráfego de saída e chamadas de
-- Edge Functions não aparecem no banco: ver no painel do Supabase.

create table if not exists public.usage_snapshots (
  day date primary key,
  db_bytes bigint not null,
  storage_bytes bigint not null,
  storage_objects bigint not null,
  users bigint not null,
  mau bigint not null,
  push_devices bigint not null,
  created_at timestamptz not null default now()
);
alter table public.usage_snapshots enable row level security;
drop policy if exists "admin reads usage_snapshots" on public.usage_snapshots;
create policy "admin reads usage_snapshots" on public.usage_snapshots for select using (public.is_admin());
revoke all on public.usage_snapshots from anon;

insert into public.app_settings (key, value) values ('cost_plan', jsonb_build_object(
  'plan', 'Free', 'baseUsd', 0, 'usdBrl', 5.5,
  'quotas', jsonb_build_object('dbGb', 0.5, 'storageGb', 1, 'mau', 50000),
  'overUsd', jsonb_build_object('dbGb', 0.125, 'storageGb', 0.021, 'mau', 0.00325)
)) on conflict (key) do nothing;

-- Medição de agora (interna).
create or replace function public.usage_metrics()
returns table (um_db_bytes bigint, um_storage_bytes bigint, um_storage_objects bigint, um_users bigint, um_mau bigint, um_push bigint)
language sql
stable
security definer
set search_path = public, storage, auth
as $$
  select pg_database_size(current_database())::bigint,
         coalesce((select sum(case when (o.metadata->>'size') ~ '^\d+$' then (o.metadata->>'size')::bigint else 0 end) from storage.objects o), 0)::bigint,
         (select count(*) from storage.objects)::bigint,
         (select count(*) from auth.users)::bigint,
         (select count(distinct a.user_id) from public.app_access_days a
           where a.day >= date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date)::bigint,
         (select count(*) from public.push_subscriptions)::bigint;
$$;
revoke execute on function public.usage_metrics() from public, anon, authenticated;

create or replace function public.ops_usage_snapshot()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.usage_snapshots (day, db_bytes, storage_bytes, storage_objects, users, mau, push_devices)
  select (now() at time zone 'America/Sao_Paulo')::date, m.* from public.usage_metrics() m
  on conflict (day) do update set
    db_bytes = excluded.db_bytes, storage_bytes = excluded.storage_bytes, storage_objects = excluded.storage_objects,
    users = excluded.users, mau = excluded.mau, push_devices = excluded.push_devices, created_at = now();
$$;
revoke execute on function public.ops_usage_snapshot() from public, anon, authenticated;

-- Painel: mede agora (e guarda o retrato do dia) + histórico.
create or replace function public.admin_usage_now()
returns table (um_db_bytes bigint, um_storage_bytes bigint, um_storage_objects bigint, um_users bigint, um_mau bigint, um_push bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  perform public.ops_usage_snapshot();
  return query select * from public.usage_metrics();
end;
$$;
revoke execute on function public.admin_usage_now() from public, anon;
grant execute on function public.admin_usage_now() to authenticated;

-- Todo dia às 6h de Brasília (9h UTC).
select cron.schedule('usage-snapshot-daily', '10 9 * * *', $$ select public.ops_usage_snapshot(); $$);
