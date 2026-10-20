-- Modo Embaixador: o embaixador ganha o mesmo modo do influenciador (modo do
-- programa no app). O que era só do influenciador passa a valer para os dois:
--   - material de divulgação: cada arquivo tem um público (influenciadores,
--     embaixadores ou todos), escolhido no painel admin;
--   - ranking do mês: cada um disputa com o próprio grupo;
--   - "mostrar meu nome no ranking": qualquer membro do programa.
-- Recados (user_notifications.kind 'embaixador') e o aviso de novos cadastros
-- não precisam de banco: ficam nas Edge Functions admin-broadcast e
-- send-ambassador-alerts.

-- ---------------------------------------------------------------------------
-- Tipo do membro ativo logado ('embaixador' | 'influenciador') ou null
-- ---------------------------------------------------------------------------
create or replace function public.my_program_kind()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select a.kind from public.ambassadors a
  where a.user_id = auth.uid() and a.active
  limit 1;
$$;

revoke execute on function public.my_program_kind() from public, anon;
grant execute on function public.my_program_kind() to authenticated;

-- ---------------------------------------------------------------------------
-- Material de divulgação por público
-- ---------------------------------------------------------------------------
alter table public.promo_materials
  add column if not exists audience text not null default 'influenciador';

alter table public.promo_materials drop constraint if exists promo_materials_audience_check;
alter table public.promo_materials add constraint promo_materials_audience_check
  check (audience in ('influenciador', 'embaixador', 'todos'));

-- Quem pode ver um material com esse público.
create or replace function public.can_read_promo(p_audience text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or (public.my_program_kind() is not null
        and (p_audience = 'todos' or p_audience = public.my_program_kind()));
$$;

-- O arquivo no storage segue o público da linha que aponta para ele.
create or replace function public.can_read_promo_object(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1 from public.promo_materials m
      where m.storage_path = p_path and public.can_read_promo(m.audience)
    );
$$;

revoke execute on function public.can_read_promo(text) from public, anon;
revoke execute on function public.can_read_promo_object(text) from public, anon;
grant execute on function public.can_read_promo(text) to authenticated;
grant execute on function public.can_read_promo_object(text) to authenticated;

drop policy if exists "influencer or admin reads promo materials" on public.promo_materials;
drop policy if exists "program or admin reads promo materials" on public.promo_materials;
create policy "program or admin reads promo materials" on public.promo_materials
  for select using (public.can_read_promo(audience));

drop policy if exists "promo_materials_read" on storage.objects;
create policy "promo_materials_read"
  on storage.objects for select
  using (bucket_id = 'promo-materials' and public.can_read_promo_object(name));

-- ---------------------------------------------------------------------------
-- Ranking do mês: cada membro disputa com o próprio grupo. O admin (sem linha
-- no programa) vê o dos influenciadores. Mesma assinatura de
-- 20261122010000_influencer_ranking.sql.
-- ---------------------------------------------------------------------------
create or replace function public.influencer_ranking(p_month_offset int default 0)
returns table (rk_position bigint, rk_name text, rk_signups bigint, rk_me boolean, rk_public boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kind text := public.my_program_kind();
  month_start date := (date_trunc('month', (now() at time zone 'America/Sao_Paulo'))
    - make_interval(months => greatest(0, least(coalesce(p_month_offset, 0), 1))))::date;
  month_end date := (month_start + interval '1 month')::date;
begin
  if v_kind is null and not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  v_kind := coalesce(v_kind, 'influenciador');

  return query
    with counts as (
      select a.id, a.user_id, a.name, a.ranking_public,
        (select count(*) from public.ambassador_referrals r
          where r.ambassador_id = a.id
            and (r.linked_at at time zone 'America/Sao_Paulo')::date >= month_start
            and (r.linked_at at time zone 'America/Sao_Paulo')::date < month_end) as n
      from public.ambassadors a
      where a.kind = v_kind and a.active and a.user_id is not null
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

create or replace function public.set_my_ranking_public(p_public boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ambassadors
  set ranking_public = coalesce(p_public, false), updated_at = now()
  where user_id = auth.uid();
  if not found then raise exception 'not_found'; end if;
end;
$$;
