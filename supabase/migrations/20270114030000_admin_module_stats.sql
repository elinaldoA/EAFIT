-- Painel admin → Configurações → Módulos de esporte: números de cada versão do
-- app (app-react/src/modules/registry.js), para decidir liberar e acompanhar.
-- O esporte da conta fica em user_metadata.esporte; sem escolha (ou com um
-- valor que não é módulo) conta como musculação, como o app faz.
--   ms_users      contas no módulo (sem admins)
--   ms_new30      contas criadas nos últimos 30 dias
--   ms_program    com programa de corrida escolhido (user_metadata.runGoal)
--   ms_runners30  quem registrou corrida nos últimos 30 dias (qualquer módulo)
--   ms_runs30     corridas registradas nos últimos 30 dias
--   ms_km30       km somados dessas corridas
-- Contagem de corrida vale para todas as contas que correram, mesmo que
-- tenham voltado para a musculação depois.

create or replace function public.admin_module_stats()
returns table (
  ms_module text, ms_users bigint, ms_new30 bigint, ms_program bigint,
  ms_runners30 bigint, ms_runs30 bigint, ms_km30 numeric
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with u as (
      select x.id,
             case when x.raw_user_meta_data->>'esporte' = 'corrida' then 'corrida' else 'musculacao' end as module,
             (x.created_at at time zone 'America/Sao_Paulo')::date as joined,
             coalesce(x.raw_user_meta_data->>'runGoal', '') <> '' as has_program
      from auth.users x
      left join public.profiles p on p.id = x.id
      where not coalesce(p.is_admin, false)
    ),
    r as (
      select r.user_id, count(*) as runs, sum(r.distance_m) as meters
      from public.runs r
      where r.run_date > today - 30
      group by r.user_id
    )
    select u.module,
           count(*)::bigint,
           count(*) filter (where u.joined > today - 30)::bigint,
           count(*) filter (where u.has_program)::bigint,
           count(r.user_id)::bigint,
           coalesce(sum(r.runs), 0)::bigint,
           round(coalesce(sum(r.meters), 0) / 1000.0, 1)
    from u left join r on r.user_id = u.id
    group by u.module;
end;
$$;

revoke all on function public.admin_module_stats() from public, anon;
grant execute on function public.admin_module_stats() to authenticated;
