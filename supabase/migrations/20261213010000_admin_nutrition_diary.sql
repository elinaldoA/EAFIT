-- Painel admin (Bem-estar): o que as pessoas registram no diário por refeição
-- da aba Nutrição. Funções novas e somente leitura, sem contas de admin;
-- `days_back` nulo ou <= 0 = todo o histórico. Antes desta migration as
-- funções não existem; quem chama trata a falha.

-- Adoção do diário por refeição e dos atalhos próprios. Entrada de código de
-- barras = registro com o ícone 🏷️ (o app usa esse ícone nos produtos lidos).
create or replace function public.admin_nutrition_adoption(days_back int default 30)
returns table (
  na_entry_users bigint, na_entries bigint,
  na_barcode_users bigint, na_barcode_entries bigint,
  na_food_users bigint, na_foods bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  since date := case when days_back is null or days_back <= 0 then null
                     else (now() at time zone 'America/Sao_Paulo')::date - (days_back - 1) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with nonadmin as (
      select u.id as uid
      from auth.users u
      left join public.profiles p on p.id = u.id
      where not coalesce(p.is_admin, false)
    ),
    e as (
      select x.user_id as uid, x.icon
      from public.nutrition_entries x
      join nonadmin n on n.uid = x.user_id
      where since is null or x.log_date >= since
    ),
    f as (
      select x.user_id as uid
      from public.nutrition_foods x
      join nonadmin n on n.uid = x.user_id
    )
    select
      (select count(distinct e.uid) from e),
      (select count(*) from e),
      (select count(distinct e.uid) from e where e.icon = '🏷️'),
      (select count(*) from e where e.icon = '🏷️'),
      (select count(distinct f.uid) from f),
      (select count(*) from f);
end;
$$;

-- Registros e pessoas por refeição.
create or replace function public.admin_nutrition_meals(days_back int default 30)
returns table (nm_meal text, nm_entries bigint, nm_users bigint, nm_avg_kcal numeric)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  since date := case when days_back is null or days_back <= 0 then null
                     else (now() at time zone 'America/Sao_Paulo')::date - (days_back - 1) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select x.meal, count(*)::bigint, count(distinct x.user_id)::bigint, round(avg(x.kcal))
    from public.nutrition_entries x
    join auth.users u on u.id = x.user_id
    left join public.profiles p on p.id = x.user_id
    where not coalesce(p.is_admin, false)
      and (since is null or x.log_date >= since)
    group by x.meal
    order by count(*) desc;
end;
$$;

-- Alimentos mais registrados. O nome vem com a quantidade ("Arroz 150g"):
-- tira o sufixo para somar o mesmo alimento.
create or replace function public.admin_nutrition_top_foods(days_back int default 30, max_rows int default 15)
returns table (nf_name text, nf_entries bigint, nf_users bigint)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  since date := case when days_back is null or days_back <= 0 then null
                     else (now() at time zone 'America/Sao_Paulo')::date - (days_back - 1) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    with k as (
      select x.user_id as uid,
             lower(btrim(regexp_replace(x.name, '\s+[0-9]+([.,][0-9]+)?\s*g$', ''))) as nm
      from public.nutrition_entries x
      join auth.users u on u.id = x.user_id
      left join public.profiles p on p.id = x.user_id
      where not coalesce(p.is_admin, false)
        and (since is null or x.log_date >= since)
    )
    select k.nm, count(*)::bigint, count(distinct k.uid)::bigint
    from k
    where k.nm <> ''
    group by k.nm
    order by count(*) desc, k.nm
    limit greatest(coalesce(max_rows, 15), 1);
end;
$$;

-- Códigos de barras que o Open Food Facts não achou (o app registra o evento
-- barcode_miss, 1 por pessoa/dia/código). Mostra o que as pessoas procuram e a
-- base não cobre.
create or replace function public.admin_barcode_misses(days_back int default 30, max_rows int default 30)
returns table (bm_code text, bm_users bigint, bm_last date)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  since date := case when days_back is null or days_back <= 0 then null
                     else (now() at time zone 'America/Sao_Paulo')::date - (days_back - 1) end;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select ev.detail, count(distinct ev.user_id)::bigint, max(ev.day)
    from public.user_events ev
    left join public.profiles p on p.id = ev.user_id
    where ev.event = 'barcode_miss'
      and not coalesce(p.is_admin, false)
      and (since is null or ev.day >= since)
    group by ev.detail
    order by count(distinct ev.user_id) desc, max(ev.day) desc
    limit greatest(coalesce(max_rows, 30), 1);
end;
$$;

revoke execute on function public.admin_nutrition_adoption(int) from public, anon;
revoke execute on function public.admin_nutrition_meals(int) from public, anon;
revoke execute on function public.admin_nutrition_top_foods(int, int) from public, anon;
revoke execute on function public.admin_barcode_misses(int, int) from public, anon;
grant execute on function public.admin_nutrition_adoption(int) to authenticated;
grant execute on function public.admin_nutrition_meals(int) to authenticated;
grant execute on function public.admin_nutrition_top_foods(int, int) to authenticated;
grant execute on function public.admin_barcode_misses(int, int) to authenticated;
