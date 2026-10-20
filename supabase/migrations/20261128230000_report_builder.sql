-- Meu relatório (Análises → Meu relatório): cada admin monta e salva os
-- cartões que quer ver, e cada cartão compara o período escolhido com o
-- anterior (ou com o mesmo período do ano passado). As métricas vêm todas de
-- admin_metric_values, uma chamada por período. Datas no horário de Brasília,
-- intervalo fechado [p_from, p_to], no máximo 366 dias. Sem admins.

create table if not exists public.admin_report_cards (
  admin_id uuid primary key references auth.users(id) on delete cascade,
  cards jsonb not null default '[]'::jsonb check (jsonb_typeof(cards) = 'array' and jsonb_array_length(cards) <= 40),
  updated_at timestamptz not null default now()
);
alter table public.admin_report_cards enable row level security;
drop policy if exists "own report cards" on public.admin_report_cards;
create policy "own report cards" on public.admin_report_cards for all
  using (admin_id = auth.uid() and public.is_admin()) with check (admin_id = auth.uid() and public.is_admin());
revoke all on public.admin_report_cards from anon;

create or replace function public.admin_metric_values(p_keys text[], p_from date, p_to date)
returns table (mv_key text, mv_value numeric)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  t0 timestamptz;
  t1 timestamptz;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then raise exception 'invalid_period'; end if;
  t0 := p_from::timestamp at time zone 'America/Sao_Paulo';
  t1 := (p_to + 1)::timestamp at time zone 'America/Sao_Paulo';

  return query
    with adm as (select id from public.profiles where is_admin),
    td as materialized (
      select t.user_id, t.day from public.training_days() t
      where t.day between p_from and p_to + 7 and t.user_id not in (select id from adm)
    ),
    su as (
      select u.id, (u.created_at at time zone 'America/Sao_Paulo')::date as joined
      from auth.users u where u.created_at >= t0 and u.created_at < t1 and u.id not in (select id from adm)
    ),
    notif as (
      select count(*) as sent, count(*) filter (where n.read_at is not null) as read
      from public.user_notifications n where n.created_at >= t0 and n.created_at < t1
    ),
    v as (
      select 'signups' as k, (select count(*) from su)::numeric as val
      union all select 'activated', (select count(*) from su where exists (select 1 from td where td.user_id = su.id and td.day between su.joined and su.joined + 6))
      union all select 'active_trainers', (select count(distinct user_id) from td where day between p_from and p_to)
      union all select 'training_days', (select count(*) from td where day between p_from and p_to)
      union all select 'app_openers', (select count(distinct a.user_id) from public.app_access_days a
                                       where a.day between p_from and p_to and a.user_id not in (select id from adm))
      union all select 'notifications_sent', (select sent from notif)
      union all select 'notifications_read', (select read from notif)
      union all select 'feedback', (select count(*) from public.feedback f where f.created_at >= t0 and f.created_at < t1)
      union all select 'contact_messages', (select count(*) from public.contact_messages c where c.created_at >= t0 and c.created_at < t1)
      union all select 'trainer_links', (select count(*) from public.trainer_clients c where c.linked_at >= t0 and c.linked_at < t1)
      union all select 'challenge_joins', (select count(*) from public.challenge_members m where m.joined_at >= t0 and m.joined_at < t1)
      union all select 'survey_answers', (select count(*) from public.survey_answers s where s.created_at >= t0 and s.created_at < t1)
      union all select 'referrals', (select count(*) from public.ambassador_referrals r where r.linked_at >= t0 and r.linked_at < t1)
      union all select 'deletions', (select count(*) from public.account_deletions d where d.deleted_at >= t0 and d.deleted_at < t1)
    )
    select v.k, v.val from v where p_keys is null or v.k = any(p_keys);
end;
$$;
revoke execute on function public.admin_metric_values(text[], date, date) from public, anon;
grant execute on function public.admin_metric_values(text[], date, date) to authenticated;
