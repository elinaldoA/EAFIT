-- Verificação em duas etapas obrigatória para o painel admin.
--
-- Quem entra no painel vê dados de todos os usuários; até aqui bastava a
-- senha. Agora is_admin() e admin_can() só valem numa sessão aal2, isto é,
-- depois que o admin confirmou o código do app autenticador (TOTP do Supabase
-- Auth). Com a senha vazada e sem o celular, a conta continua sendo só uma
-- conta comum: nenhuma policy, função admin_* ou Edge Function de admin
-- libera nada (as Edge Functions checam via rpc('is_admin') com o token de
-- quem chamou).
--
-- Toda função admin_* passa por is_admin() ou admin_can() (conferido em
-- produção em 2026-10-21), e nenhuma policy lê profiles.is_admin direto, então
-- trocar as duas basta. my_admin_access segue a mesma regra só para o painel
-- não mostrar menu antes da segunda etapa.
--
-- Recuperação (admin perdeu o celular): pelo SQL editor,
--   delete from auth.mfa_factors where user_id = '<id do admin>';
-- e no próximo login o painel pede um cadastro novo do autenticador.

create or replace function public.is_admin()
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

create or replace function public.admin_can(area text)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select case r
    when '' then false
    when 'superadmin' then true
    else (r = 'suporte' and area in ('users', 'notifications', 'segments'))
      or (r = 'conteudo' and area in ('content', 'settings'))
      or exists (select 1 from public.admin_access a where a.admin_id = auth.uid() and area = any(a.extra_areas))
  end
  from (
    select coalesce((
      select p.admin_role from public.profiles p
      where p.id = auth.uid() and p.is_admin
        and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    ), '') as r
  ) x;
$$;

create or replace function public.my_admin_access()
returns jsonb
language sql
stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'role', p.admin_role,
    'extra_areas', coalesce(to_jsonb(a.extra_areas), '[]'::jsonb),
    'hidden_screens', case when p.admin_role = 'superadmin' then '[]'::jsonb else coalesce(to_jsonb(a.hidden_screens), '[]'::jsonb) end
  )
  from public.profiles p
  left join public.admin_access a on a.admin_id = p.id
  where p.id = auth.uid() and p.is_admin
    and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;
