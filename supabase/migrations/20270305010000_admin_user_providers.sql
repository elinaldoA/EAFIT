-- Painel admin -> Usuarios: como cada pessoa entra (Google, e-mail e senha...).
-- Le auth.identities das contas da pagina atual. Funcao separada de
-- admin_list_users_page de proposito: aquela e grande e em producao pode estar
-- diferente do repositorio.
--
-- up_providers: lista de provedores da conta, ex.: {email}, {google} ou
-- {email,google}. Conta sem identidade registrada devolve lista vazia.

create or replace function public.admin_user_providers(p_ids uuid[])
returns table (up_id uuid, up_providers text[])
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;

  return query
    select i.user_id, array_agg(distinct i.provider order by i.provider)
    from auth.identities i
    where i.user_id = any(coalesce(p_ids, '{}'::uuid[]))
    group by i.user_id;
end;
$$;

revoke all on function public.admin_user_providers(uuid[]) from public, anon;
grant execute on function public.admin_user_providers(uuid[]) to authenticated;
