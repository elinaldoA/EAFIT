-- Painel admin: campanhas e origens (Análises → Campanhas). O app e a landing
-- guardam a primeira chegada vinda de fora (utm_source/origem, ou referrer de
-- outro site) e mandam no cadastro em user_metadata.utm = { source, campaign,
-- medium, content } (app-react/src/lib/attribution.js). Contas antigas, sem
-- utm, entram pela origem do link de embaixador (refSource) ou como "sem origem".
--
-- campaign_costs: quanto se gastou em cada origem/campanha, para o custo por
-- cadastro ativado.

create table if not exists public.campaign_costs (
  source text not null check (source ~ '^[a-z0-9_-]{1,40}$'),
  campaign text not null default '' check (campaign ~ '^[a-z0-9_-]{0,40}$'),
  cost numeric not null default 0 check (cost >= 0),
  notes text not null default '' check (char_length(notes) <= 300),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (source, campaign)
);

alter table public.campaign_costs enable row level security;
drop policy if exists "admin reads campaign costs" on public.campaign_costs;
create policy "admin reads campaign costs" on public.campaign_costs for select using (public.is_admin());
drop policy if exists "admin writes campaign costs" on public.campaign_costs;
create policy "admin writes campaign costs" on public.campaign_costs for all
  using (public.admin_can('settings')) with check (public.admin_can('settings'));
revoke all on public.campaign_costs from anon;

-- Por origem + campanha no período (days_back <= 0 = desde sempre), sem admins:
--   ca_visits      visitas à landing e à tela de acesso com essa origem/campanha
--   ca_signups     contas criadas
--   ca_confirmed   com e-mail confirmado
--   ca_activated   treinaram nos 7 primeiros dias
--   ca_active30    treinaram nos últimos 30 dias
--   ca_attributed  quantas das contas tinham utm (o resto veio de refSource)
create or replace function public.admin_campaign_attribution(days_back int default 30)
returns table (
  ca_source text, ca_campaign text, ca_visits bigint, ca_signups bigint, ca_confirmed bigint,
  ca_activated bigint, ca_active30 bigint, ca_attributed bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  since timestamptz := case when coalesce(days_back, 30) <= 0 then '-infinity'::timestamptz
                            else now() - make_interval(days => least(days_back, 3650)) end;
  since_day date := case when coalesce(days_back, 30) <= 0 then '-infinity'::date
                         else (now() at time zone 'America/Sao_Paulo')::date - (least(days_back, 3650) - 1) end;
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with acc as (
      select u.id, u.email_confirmed_at,
             (u.created_at at time zone 'America/Sao_Paulo')::date as joined,
             coalesce(nullif(u.raw_user_meta_data->'utm'->>'source', ''), nullif(u.raw_user_meta_data->>'refSource', ''), 'sem_origem') as source,
             coalesce(u.raw_user_meta_data->'utm'->>'campaign', '') as campaign,
             (u.raw_user_meta_data->'utm'->>'source') is not null as attributed
      from auth.users u
      left join public.profiles p on p.id = u.id
      where u.created_at >= since and not coalesce(p.is_admin, false)
    ),
    td as (
      select t.user_id, t.day from public.training_days() t where t.user_id in (select id from acc)
    ),
    s as (
      select acc.source, acc.campaign,
             count(*) as signups,
             count(*) filter (where acc.email_confirmed_at is not null) as confirmed,
             count(*) filter (where exists (select 1 from td where td.user_id = acc.id and td.day between acc.joined and acc.joined + 6)) as activated,
             count(*) filter (where exists (select 1 from td where td.user_id = acc.id and td.day > today - 30)) as active30,
             count(*) filter (where acc.attributed) as attributed
      from acc group by acc.source, acc.campaign
    ),
    v as (
      select pv.source, coalesce(pv.campaign, '') as campaign, count(*) as visits
      from public.page_visits pv
      where pv.visited_on >= since_day and pv.source not in ('direto', 'landing')
      group by pv.source, coalesce(pv.campaign, '')
    )
    select coalesce(s.source, v.source), coalesce(s.campaign, v.campaign),
           coalesce(v.visits, 0)::bigint, coalesce(s.signups, 0)::bigint, coalesce(s.confirmed, 0)::bigint,
           coalesce(s.activated, 0)::bigint, coalesce(s.active30, 0)::bigint, coalesce(s.attributed, 0)::bigint
    from s full join v on v.source = s.source and v.campaign = s.campaign
    order by coalesce(s.signups, 0) desc, coalesce(v.visits, 0) desc;
end;
$$;

revoke execute on function public.admin_campaign_attribution(int) from public, anon;
grant execute on function public.admin_campaign_attribution(int) to authenticated;
