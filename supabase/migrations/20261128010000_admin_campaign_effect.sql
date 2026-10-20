-- Painel admin: efeito das notificações (Comunicação → Resultados). Para cada
-- envio, quantos receberam, leram no sino, abriram o app e treinaram depois —
-- comparado com quanto as mesmas pessoas treinavam nos 3 dias antes.
--
-- Cada envio manual/agendado grava um id de campanha nas linhas da central de
-- avisos (admin-broadcast e send-scheduled-broadcast). Envios antigos, sem id,
-- são agrupados por tipo + título + dia. As automáticas (send-engagement) são
-- agrupadas por tipo (título = nome da regra): cada linha é um envio para uma
-- pessoa num dia.

alter table public.user_notifications add column if not exists campaign uuid;
create index if not exists user_notifications_campaign_idx on public.user_notifications (campaign) where campaign is not null;
create index if not exists user_notifications_created_idx on public.user_notifications (created_at);

-- days_back <= 0 = desde sempre. Admins ficam de fora (como nas métricas).
-- "Até o dia seguinte" e "em até 3 dias" contam dias do calendário de
-- Brasília a partir do dia do envio (o banco guarda treino e acesso por dia).
create or replace function public.admin_campaign_effect(days_back int default 30)
returns table (
  ce_key text, ce_origin text, ce_kind text, ce_title text, ce_body text,
  ce_first_at timestamptz, ce_last_at timestamptz,
  ce_sent bigint, ce_read bigint, ce_app1 bigint, ce_trained1 bigint, ce_trained3 bigint, ce_before3 bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since timestamptz := case when coalesce(days_back, 30) <= 0 then '-infinity'::timestamptz
                            else now() - make_interval(days => least(days_back, 3650)) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with n as (
      select un.user_id, un.kind, un.title, un.body, un.created_at, un.read_at,
             (un.created_at at time zone 'America/Sao_Paulo')::date as d,
             case when un.kind in ('aviso', 'influenciador', 'embaixador') then 'manual' else 'auto' end as origin,
             case
               when un.campaign is not null then un.campaign::text
               when un.kind in ('aviso', 'influenciador', 'embaixador')
                 then un.kind || '|' || un.title || '|' || ((un.created_at at time zone 'America/Sao_Paulo')::date)::text
               else 'auto|' || un.kind
             end as k
      from public.user_notifications un
      left join public.profiles p on p.id = un.user_id
      where un.created_at >= since and coalesce(p.is_admin, false) = false
    ),
    td as (
      select t.user_id, t.day from public.training_days() t
      where t.user_id in (select distinct n.user_id from n)
    ),
    f as (
      select n.*,
             exists (select 1 from public.app_access_days a
                      where a.user_id = n.user_id and a.day between n.d and n.d + 1) as app1,
             exists (select 1 from td where td.user_id = n.user_id and td.day between n.d and n.d + 1) as tr1,
             exists (select 1 from td where td.user_id = n.user_id and td.day between n.d and n.d + 3) as tr3,
             exists (select 1 from td where td.user_id = n.user_id and td.day between n.d - 3 and n.d - 1) as bf3
      from n
    )
    select f.k, min(f.origin), min(f.kind),
           case when min(f.origin) = 'auto'
                then coalesce((select r.label from public.engagement_rules r where r.kind = min(f.kind)), min(f.kind))
                else (array_agg(f.title order by f.created_at desc))[1] end,
           (array_agg(f.body order by f.created_at desc))[1],
           min(f.created_at), max(f.created_at),
           count(*), count(*) filter (where f.read_at is not null),
           count(*) filter (where f.app1), count(*) filter (where f.tr1),
           count(*) filter (where f.tr3), count(*) filter (where f.bf3)
    from f
    group by f.k
    order by max(f.created_at) desc
    limit 300;
end;
$$;

revoke execute on function public.admin_campaign_effect(int) from public, anon;
grant execute on function public.admin_campaign_effect(int) to authenticated;
