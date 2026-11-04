-- Marketing -> Resultados: retencao das redes.
--
-- Soma duas colunas a admin_marketing_conversion:
--   mc_mature    cadastros com mais de 7 dias de conta (base justa para retencao)
--   mc_retained  desses, quem voltou a treinar entre o dia 8 e o dia 30 depois do cadastro
-- Assim da para ver qual rede/tipo de link traz gente que continua, nao so quem se cadastra.

drop function if exists public.admin_marketing_conversion(int);

create or replace function public.admin_marketing_conversion(days_back int default 30)
returns table (
  mc_source text, mc_medium text, mc_visits bigint, mc_signups bigint, mc_confirmed bigint, mc_activated bigint,
  mc_mature bigint, mc_retained bigint
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
  cur date := (now() at time zone 'America/Sao_Paulo')::date;
  networks text[] := array['instagram', 'facebook', 'threads', 'tiktok'];
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with acc as (
      select u.id, u.email_confirmed_at,
             (u.created_at at time zone 'America/Sao_Paulo')::date as joined,
             u.raw_user_meta_data->'utm'->>'source' as source,
             coalesce(u.raw_user_meta_data->'utm'->>'medium', '') as medium
      from auth.users u
      left join public.profiles p on p.id = u.id
      where u.created_at >= since and not coalesce(p.is_admin, false)
        and (u.raw_user_meta_data->'utm'->>'source') = any (networks)
    ),
    td as (
      select t.user_id, t.day from public.training_days() t where t.user_id in (select id from acc)
    ),
    s as (
      select acc.source, acc.medium,
             count(*) as signups,
             count(*) filter (where acc.email_confirmed_at is not null) as confirmed,
             count(*) filter (where exists (select 1 from td where td.user_id = acc.id and td.day between acc.joined and acc.joined + 6)) as activated,
             count(*) filter (where acc.joined <= cur - 8) as mature,
             count(*) filter (where acc.joined <= cur - 8 and exists (select 1 from td where td.user_id = acc.id and td.day between acc.joined + 7 and acc.joined + 30)) as retained
      from acc group by acc.source, acc.medium
    ),
    v as (
      select pv.source, coalesce(pv.medium, '') as medium, count(*) as visits
      from public.page_visits pv
      where pv.visited_on >= since_day and pv.source = any (networks)
      group by pv.source, coalesce(pv.medium, '')
    )
    select coalesce(s.source, v.source), coalesce(s.medium, v.medium),
           coalesce(v.visits, 0)::bigint, coalesce(s.signups, 0)::bigint,
           coalesce(s.confirmed, 0)::bigint, coalesce(s.activated, 0)::bigint,
           coalesce(s.mature, 0)::bigint, coalesce(s.retained, 0)::bigint
    from s full join v on v.source = s.source and v.medium = s.medium
    order by coalesce(s.signups, 0) desc, coalesce(v.visits, 0) desc;
end;
$$;

revoke execute on function public.admin_marketing_conversion(int) from public, anon;
grant execute on function public.admin_marketing_conversion(int) to authenticated;
