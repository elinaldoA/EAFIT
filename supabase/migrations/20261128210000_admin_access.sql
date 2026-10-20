-- Permissões finas por admin (Sistema → Administradores), além do papel
-- (profiles.admin_role, ver 20261113010000_admin_roles.sql):
--   extra_areas    áreas de escrita a mais que o papel (vale no banco: admin_can)
--   hidden_screens telas do painel que somem do menu para essa pessoa (caminhos
--                  da navegação, ex. '/comissoes'). É só interface: a leitura no
--                  banco continua a de qualquer admin. Não vale para superadmin.
-- Só superadmin (admin_can('admins')) edita.

create table if not exists public.admin_access (
  admin_id uuid primary key references auth.users(id) on delete cascade,
  extra_areas text[] not null default '{}'
    check (extra_areas <@ array['users', 'notifications', 'segments', 'content', 'settings']::text[]),
  hidden_screens text[] not null default '{}' check (cardinality(hidden_screens) <= 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.admin_access enable row level security;
drop policy if exists "read own or superadmin" on public.admin_access;
create policy "read own or superadmin" on public.admin_access for select
  using (admin_id = auth.uid() or public.admin_can('admins'));
drop policy if exists "superadmin writes admin_access" on public.admin_access;
create policy "superadmin writes admin_access" on public.admin_access for all
  using (public.admin_can('admins')) with check (public.admin_can('admins'));
revoke all on public.admin_access from anon;

-- Mesmo papel→áreas de antes, mais as áreas extras da pessoa.
create or replace function public.admin_can(area text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case r
    when '' then false
    when 'superadmin' then true
    else (r = 'suporte' and area in ('users', 'notifications', 'segments'))
      or (r = 'conteudo' and area in ('content', 'settings'))
      or exists (select 1 from public.admin_access a where a.admin_id = auth.uid() and area = any(a.extra_areas))
  end
  from (select coalesce((select p.admin_role from public.profiles p where p.id = auth.uid() and p.is_admin), '') as r) x;
$$;

-- O painel lê para montar o menu.
create or replace function public.my_admin_access()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'role', p.admin_role,
    'extra_areas', coalesce(to_jsonb(a.extra_areas), '[]'::jsonb),
    'hidden_screens', case when p.admin_role = 'superadmin' then '[]'::jsonb else coalesce(to_jsonb(a.hidden_screens), '[]'::jsonb) end
  )
  from public.profiles p
  left join public.admin_access a on a.admin_id = p.id
  where p.id = auth.uid() and p.is_admin;
$$;
revoke execute on function public.my_admin_access() from public, anon;
grant execute on function public.my_admin_access() to authenticated;

-- Lista para o superadmin: papel e permissões de cada admin.
create or replace function public.admin_list_access()
returns table (aa_user uuid, aa_email text, aa_role text, aa_extra text[], aa_hidden text[], aa_updated timestamptz)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  return query
    select p.id, u.email::text, p.admin_role, coalesce(a.extra_areas, '{}'), coalesce(a.hidden_screens, '{}'), a.updated_at
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.admin_access a on a.admin_id = p.id
    where p.is_admin
    order by u.email;
end;
$$;
revoke execute on function public.admin_list_access() from public, anon;
grant execute on function public.admin_list_access() to authenticated;
