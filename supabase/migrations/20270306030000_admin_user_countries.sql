-- Painel admin -> Usuarios: pais de cada conta (ultimo acesso, vem de
-- user_client.country, ISO 3166-1 alfa-2). Funcoes separadas de
-- admin_list_users_page de proposito (mesmo motivo de admin_user_providers).

-- Pais das contas da pagina atual. Conta sem localizacao nao aparece.
create or replace function public.admin_user_countries(p_ids uuid[])
returns table (uco_id uuid, uco_country text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select uc.user_id, uc.country
    from public.user_client uc
    where uc.user_id = any(coalesce(p_ids, '{}'::uuid[]))
      and uc.country is not null;
end;
$$;

revoke all on function public.admin_user_countries(uuid[]) from public, anon;
grant execute on function public.admin_user_countries(uuid[]) to authenticated;

-- Quantas contas por pais na base inteira. country null = sem localizacao.
create or replace function public.admin_users_by_country()
returns table (ubc_country text, ubc_users bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select uc.country, count(*)::bigint
    from public.user_client uc
    group by uc.country
    order by count(*) desc;
end;
$$;

revoke all on function public.admin_users_by_country() from public, anon;
grant execute on function public.admin_users_by_country() to authenticated;
