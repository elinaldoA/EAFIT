-- Saúde do sistema: o bloco "Jobs agendados" estourava o statement timeout
-- ("canceling statement due to statement timeout").
--
-- Causa: nada limpava cron.job_run_details (o pg_cron nunca apaga o histórico)
-- e admin_cron_status fazia, para cada um dos ~40 jobs, duas contagens e uma
-- busca do último registro nessa tabela, que não tem índice por job/data.
--
-- Correção:
--   1. histórico de execuções limitado a 7 dias (limpeza agora e todo dia);
--   2. admin_cron_status lê a tabela uma única vez, só a janela de 7 dias;
--   3. índice por (jobid, start_time) quando o papel atual puder criá-lo.

-- 1. Limpeza do histórico: agora e diariamente.
delete from cron.job_run_details where start_time < now() - interval '7 days';

select cron.schedule(
  'purge-old-cron-run-details-daily',
  '55 6 * * *',
  $$ delete from cron.job_run_details where start_time < now() - interval '7 days'; $$
);

-- 3. Índice (a tabela é do schema cron: se faltar permissão, segue sem ele).
do $$
begin
  create index if not exists job_run_details_jobid_start_time_idx
    on cron.job_run_details (jobid, start_time desc);
exception when others then
  raise notice 'índice em cron.job_run_details não criado: %', sqlerrm;
end $$;

-- 2. Mesma assinatura e mesmas colunas de antes; só a consulta mudou.
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
set statement_timeout = '30s'
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with recent as (
      select d.jobid, d.start_time, d.status, d.return_message
      from cron.job_run_details d
      where d.start_time > now() - interval '7 days'
    ),
    agg as (
      select r.jobid,
             count(*) filter (where r.start_time > now() - interval '24 hours') as runs,
             count(*) filter (where r.start_time > now() - interval '24 hours' and r.status = 'failed') as fails
      from recent r
      group by r.jobid
    ),
    latest as (
      select distinct on (r.jobid) r.jobid, r.start_time, r.status, r.return_message
      from recent r
      order by r.jobid, r.start_time desc
    )
    select j.jobname::text, j.schedule::text, j.active, l.start_time, l.status::text, l.return_message::text,
           coalesce(a.runs, 0)::bigint, coalesce(a.fails, 0)::bigint
    from cron.job j
    left join latest l on l.jobid = j.jobid
    left join agg a on a.jobid = j.jobid
    order by j.jobname;
end;
$$;

grant execute on function public.admin_cron_status() to authenticated;
