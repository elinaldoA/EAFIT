-- Tela de Usuários do backoffice passa a mostrar nome, sobrenome, apelido e
-- peso alvo (vivem em auth.users.raw_user_meta_data) e a busca também casa
-- com esses campos. Muda o tipo de retorno, então precisa dropar antes.
drop function if exists public.admin_list_users_page(text, text, int, int);

create function public.admin_list_users_page(
  search text default null,
  status_filter text default null, -- 'admin' | 'banned' | 'unconfirmed' | 'active' | null (todos)
  page_size int default 50,
  page_offset int default 0
)
returns table (
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  is_admin boolean,
  nome text,
  sobrenome text,
  apelido text,
  peso_alvo text,
  total_count bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  return query
    with base as (
      select u.id, u.email::text as email, u.created_at, u.last_sign_in_at, u.email_confirmed_at,
             u.banned_until, coalesce(p.is_admin, false) as is_admin,
             u.raw_user_meta_data->>'nome' as nome,
             u.raw_user_meta_data->>'sobrenome' as sobrenome,
             u.raw_user_meta_data->>'apelido' as apelido,
             u.raw_user_meta_data->>'pesoAlvo' as peso_alvo
      from auth.users u
      left join public.profiles p on p.id = u.id
      where (search is null or search = ''
             or u.email ilike '%' || search || '%'
             or (u.raw_user_meta_data->>'nome') ilike '%' || search || '%'
             or (u.raw_user_meta_data->>'sobrenome') ilike '%' || search || '%'
             or (u.raw_user_meta_data->>'apelido') ilike '%' || search || '%')
        and (
          status_filter is null
          or (status_filter = 'admin' and coalesce(p.is_admin, false))
          or (status_filter = 'banned' and u.banned_until is not null and u.banned_until > now())
          or (status_filter = 'unconfirmed' and u.email_confirmed_at is null)
          or (status_filter = 'active' and not coalesce(p.is_admin, false)
              and (u.banned_until is null or u.banned_until <= now())
              and u.email_confirmed_at is not null)
        )
    )
    select b.*, count(*) over()::bigint as total_count
    from base b
    order by b.created_at desc
    limit page_size offset page_offset;
end;
$$;

grant execute on function public.admin_list_users_page(text, text, int, int) to authenticated;
