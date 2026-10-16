-- Painel do embaixador no app (Perfil → Embaixador): o próprio embaixador vê
-- o código, o link e os NÚMEROS do que trouxe — visitas pelo link, cadastros,
-- ativos e canais. Nunca nome, e-mail ou qualquer dado de quem se cadastrou
-- (decisão de privacidade: as contas vinculadas só aparecem no painel admin).
-- Base: 20261108010000_ambassadors.sql.
--
-- Todas as funções olham só para o embaixador da conta logada (auth.uid());
-- quem não é embaixador recebe vazio.

-- Resumo do período. Embaixador inativo também vê (o app avisa que o link
-- está pausado).
create or replace function public.my_ambassador_summary(days_back int default 30)
returns table (
  am_name text, am_code text, am_active boolean,
  am_visits bigint, am_signups bigint, am_total bigint, am_active_7d bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  since date := case when days_back is null or days_back <= 0 then null else today - (days_back - 1) end;
begin
  if auth.uid() is null then return; end if;

  return query
    select a.name, a.code, a.active,
      (select count(*) from public.page_visits v
         where v.ref = a.code and (since is null or v.visited_on >= since)),
      (select count(*) from public.ambassador_referrals r
         where r.ambassador_id = a.id
           and (since is null or (r.linked_at at time zone 'America/Sao_Paulo')::date >= since)),
      (select count(*) from public.ambassador_referrals r where r.ambassador_id = a.id),
      (select count(*) from public.ambassador_referrals r
         join public.user_client uc on uc.user_id = r.user_id
         where r.ambassador_id = a.id and uc.last_seen >= today - 6)
    from public.ambassadors a
    where a.user_id = auth.uid();
end;
$$;

revoke execute on function public.my_ambassador_summary(int) from public, anon;
grant execute on function public.my_ambassador_summary(int) to authenticated;

-- Visitas e cadastros por canal no período.
create or replace function public.my_ambassador_channels(days_back int default 30)
returns table (ch_source text, ch_visits bigint, ch_signups bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  since date := case when days_back is null or days_back <= 0 then null else today - (days_back - 1) end;
  a public.ambassadors;
begin
  select * into a from public.ambassadors where user_id = auth.uid();
  if a.id is null then return; end if;

  return query
    with v as (
      select pv.source as s, count(*) as n from public.page_visits pv
      where pv.ref = a.code and (since is null or pv.visited_on >= since)
      group by 1
    ),
    r as (
      select ar.source as s, count(*) as n from public.ambassador_referrals ar
      where ar.ambassador_id = a.id
        and (since is null or (ar.linked_at at time zone 'America/Sao_Paulo')::date >= since)
      group by 1
    )
    select coalesce(v.s, r.s), coalesce(v.n, 0), coalesce(r.n, 0)
    from v full join r on r.s = v.s
    order by 3 desc, 2 desc, 1;
end;
$$;

revoke execute on function public.my_ambassador_channels(int) from public, anon;
grant execute on function public.my_ambassador_channels(int) to authenticated;

-- Visitas e cadastros por dia (no máximo 90 dias; "tudo" = 90).
create or replace function public.my_ambassador_daily(days_back int default 30)
returns table (day date, visits bigint, signups bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  n int := greatest(1, least(coalesce(nullif(days_back, 0), 90), 90));
  a public.ambassadors;
begin
  select * into a from public.ambassadors where user_id = auth.uid();
  if a.id is null then return; end if;

  return query
    select d::date,
      (select count(*) from public.page_visits v where v.ref = a.code and v.visited_on = d::date),
      (select count(*) from public.ambassador_referrals r
         where r.ambassador_id = a.id and (r.linked_at at time zone 'America/Sao_Paulo')::date = d::date)
    from generate_series(today - (n - 1), today, interval '1 day') d
    order by 1;
end;
$$;

revoke execute on function public.my_ambassador_daily(int) from public, anon;
grant execute on function public.my_ambassador_daily(int) to authenticated;
