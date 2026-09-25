-- Fecha escalada de privilégio: as policies de public.profiles
-- ("Usuários podem inserir/atualizar seus próprios perfis", baseline) liberam
-- INSERT/UPDATE na própria linha sem restringir colunas, e is_admin foi
-- adicionada depois nessa mesma tabela (20260716000000_admin_role.sql). Sem
-- esta trigger, qualquer usuário logado conseguia rodar
--   db.from('profiles').update({ is_admin: true }).eq('id', <próprio id>)
-- e ganhar "admin full access" em todas as tabelas + as Edge Functions de admin.
--
-- REVOKE de coluna não resolve aqui: o Supabase concede UPDATE/INSERT na
-- tabela inteira pra `authenticated`, e privilégio de tabela vence o de coluna.
--
-- Regra: só quem já é admin (is_admin()) pode mudar is_admin de alguém — é o
-- que app-admin/src/pages/UserDetail.jsx faz ao promover/remover admin.
-- Chamadas com service_role / postgres (Edge Functions, SQL editor,
-- migrations) não passam por `authenticated`/`anon` e ficam liberadas.
--
-- A função é SECURITY INVOKER de propósito: com SECURITY DEFINER,
-- current_user viraria o dono da função e a checagem de papel não valeria.
--
-- Depois de aplicar, confira quem está como admin em produção:
--   select p.id, u.email from public.profiles p join auth.users u on u.id = p.id where p.is_admin;
create or replace function public.guard_profiles_is_admin()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.is_admin, false) and not public.is_admin() then
      raise exception 'not_authorized: is_admin só pode ser alterado por um admin' using errcode = '42501';
    end if;
  elsif new.is_admin is distinct from old.is_admin and not public.is_admin() then
    raise exception 'not_authorized: is_admin só pode ser alterado por um admin' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profiles_is_admin on public.profiles;
create trigger guard_profiles_is_admin
  before insert or update on public.profiles
  for each row execute function public.guard_profiles_is_admin();
