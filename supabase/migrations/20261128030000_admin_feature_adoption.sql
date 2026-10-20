-- Painel admin: adoção das funcionalidades (Análises → Comportamento). Para
-- cada funcionalidade registrada pelo app (user_events, event 'feature'):
-- quantos usaram no período e no período anterior de mesmo tamanho, e quanto
-- quem usou continua treinando comparado com quem não usou (entre os ativos no
-- período). "Continua treinando" = treinou nos últimos 7 dias. Sem admins.
--
-- A linha com fa_feature = '__active__' traz os ativos do período (qualquer
-- evento) e quantos deles treinaram nos últimos 7 dias, para o painel montar
-- o "não usou" de cada funcionalidade.
create or replace function public.admin_feature_adoption(days_back int default 30)
returns table (fa_feature text, fa_users bigint, fa_prev_users bigint, fa_trained7 bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  n int := greatest(1, least(coalesce(nullif(days_back, 0), 30), 365));
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  since date := today - (n - 1);
  prev_since date := today - (2 * n - 1);
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with ev as (
      select e.user_id, e.event, e.detail, e.day
      from public.user_events e
      left join public.profiles p on p.id = e.user_id
      where e.day >= prev_since and not coalesce(p.is_admin, false)
    ),
    trained as (
      select distinct t.user_id from public.training_days() t where t.day > today - 7 and t.day <= today
    ),
    feat as (
      select ev.detail as feature,
             count(distinct ev.user_id) filter (where ev.day >= since) as users,
             count(distinct ev.user_id) filter (where ev.day < since) as prev_users,
             count(distinct ev.user_id) filter (where ev.day >= since and ev.user_id in (select user_id from trained)) as trained7
      from ev where ev.event = 'feature'
      group by ev.detail
    )
    select f.feature, f.users, f.prev_users, f.trained7 from feat f
    union all
    select '__active__',
           count(distinct ev.user_id) filter (where ev.day >= since),
           count(distinct ev.user_id) filter (where ev.day < since),
           count(distinct ev.user_id) filter (where ev.day >= since and ev.user_id in (select user_id from trained))
    from ev;
end;
$$;

revoke execute on function public.admin_feature_adoption(int) from public, anon;
grant execute on function public.admin_feature_adoption(int) to authenticated;
