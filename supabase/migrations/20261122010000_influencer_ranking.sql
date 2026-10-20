-- Ranking do mês entre influenciadores (modo Influenciador → Resultados), por
-- contas criadas pelo link no mês (horário de Brasília). Só entre
-- influenciadores ativos; embaixador não entra nem vê.
--
-- Privacidade: o nome só aparece para quem ligou "Mostrar meu nome no
-- ranking" (Conta); os demais vão como anônimos. Cada um sempre se vê.

alter table public.ambassadors
  add column if not exists ranking_public boolean not null default false;

-- ---------------------------------------------------------------------------
-- Ranking. p_month_offset: 0 = mês atual, 1 = mês passado.
-- ---------------------------------------------------------------------------
create or replace function public.influencer_ranking(p_month_offset int default 0)
returns table (rk_position bigint, rk_name text, rk_signups bigint, rk_me boolean, rk_public boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  month_start date := (date_trunc('month', (now() at time zone 'America/Sao_Paulo'))
    - make_interval(months => greatest(0, least(coalesce(p_month_offset, 0), 1))))::date;
  month_end date := (month_start + interval '1 month')::date;
begin
  if not (public.is_active_influencer() or public.is_admin()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query
    with counts as (
      select a.id, a.user_id, a.name, a.ranking_public,
        (select count(*) from public.ambassador_referrals r
          where r.ambassador_id = a.id
            and (r.linked_at at time zone 'America/Sao_Paulo')::date >= month_start
            and (r.linked_at at time zone 'America/Sao_Paulo')::date < month_end) as n
      from public.ambassadors a
      where a.kind = 'influenciador' and a.active and a.user_id is not null
    )
    select rank() over (order by c.n desc),
      case when c.ranking_public or c.user_id = auth.uid() then c.name else null end,
      c.n,
      c.user_id = auth.uid(),
      c.ranking_public
    from counts c
    order by c.n desc, (c.user_id = auth.uid()) desc, c.name;
end;
$$;

-- O próprio influenciador liga/desliga o nome no ranking.
create or replace function public.set_my_ranking_public(p_public boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ambassadors
  set ranking_public = coalesce(p_public, false), updated_at = now()
  where user_id = auth.uid() and kind = 'influenciador';
  if not found then raise exception 'not_found'; end if;
end;
$$;

revoke execute on function public.influencer_ranking(int) from public, anon;
revoke execute on function public.set_my_ranking_public(boolean) from public, anon;
grant execute on function public.influencer_ranking(int) to authenticated;
grant execute on function public.set_my_ranking_public(boolean) to authenticated;
