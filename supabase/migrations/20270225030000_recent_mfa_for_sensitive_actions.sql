-- Código do autenticador também no servidor, nas ações mais sensíveis do painel.
--
-- Até aqui o painel pedia o código do app autenticador de novo (diálogo de
-- confirmação) antes de apagar dados, mudar quem é admin ou registrar termos,
-- mas isso era só a tela: quem tivesse uma sessão aal2 aberta (computador
-- esquecido logado, token roubado) chamava a API direto, sem digitar nada.
--
-- Agora o servidor confere no próprio JWT: o claim `amr` guarda cada método de
-- login com a hora em que foi confirmado. A ação só passa se houve uma
-- confirmação TOTP nos últimos 10 minutos (a tela pede de novo a cada 5, então
-- sobra margem para relógios diferentes). Logo após o login com o código também
-- vale: o login é uma confirmação TOTP.
--
-- Protege:
--   * admin_purge_old            (limpar dados antigos)
--   * admin_publish_legal_version (registrar termos/privacidade)
--   * apagar erros do app         (policy de delete em client_errors)
--   * mudar is_admin ou admin_role em profiles (trigger guard_profiles_is_admin)
--   * gravar admin_access         (áreas extras e telas ocultas)
--
-- Em caso de erro a API responde "reauth_required: ..." e o painel mostra o texto.

create or replace function public.recent_mfa(p_max_age_seconds int default 600)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    and exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end
      ) a
      where jsonb_typeof(a) = 'object'
        and a ->> 'method' = 'totp'
        and coalesce(nullif(a ->> 'timestamp', ''), '0')::numeric
            >= extract(epoch from now()) - p_max_age_seconds
    );
$$;

grant execute on function public.recent_mfa(int) to authenticated;

create or replace function public.require_recent_mfa()
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if not public.recent_mfa() then
    raise exception 'reauth_required: confirme o código do autenticador e tente de novo' using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.require_recent_mfa() to authenticated;

-- RPCs: a conferência vem logo depois da checagem de área (quem não é admin
-- continua recebendo not_authorized, não a pergunta do código). Corpo atual mantido.
do $$
declare
  r record;
  v_def text;
  v_new text;
begin
  for r in
    select * from (values
      ('public.admin_purge_old(text,int)',                        'admins'),
      ('public.admin_publish_legal_version(text,text,date,text)', 'admins')
    ) as t(fn, area)
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if position('require_recent_mfa' in v_def) > 0 then
      continue; -- rodada repetida
    end if;
    v_new := replace(
      v_def,
      format('if not public.admin_can(%L) then raise exception ''not_authorized''; end if;', r.area),
      format('if not public.admin_can(%L) then raise exception ''not_authorized''; end if;', r.area)
        || E'\n  perform public.require_recent_mfa();'
    );
    if v_new = v_def then
      raise exception 'não achei a checagem de área em %: rode 20270225010000_admin_rpc_roles.sql antes', r.fn;
    end if;
    execute v_new;
  end loop;
end $$;

-- Apagar erros do app.
drop policy if exists "admin deletes" on public.client_errors;
create policy "admin deletes" on public.client_errors
  for delete to authenticated
  using ((select public.admin_can('admins')) and (select public.recent_mfa()));

-- Gravar permissões extras de um admin (áreas e telas ocultas).
drop policy if exists "admin_access_insert_m" on public.admin_access;
create policy "admin_access_insert_m" on public.admin_access as permissive for insert to public
  with check (admin_can('admins'::text) and recent_mfa());
drop policy if exists "admin_access_update_m" on public.admin_access;
create policy "admin_access_update_m" on public.admin_access as permissive for update to public
  using (admin_can('admins'::text)) with check (admin_can('admins'::text) and recent_mfa());
drop policy if exists "admin_access_delete_m" on public.admin_access;
create policy "admin_access_delete_m" on public.admin_access as permissive for delete to public
  using (admin_can('admins'::text) and recent_mfa());

-- Trocar quem é admin ou o papel: mesma função de antes (20261113010000_admin_roles.sql)
-- com a exigência do código recente quando o admin ou o papel muda.
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
    if (coalesce(new.is_admin, false) or new.admin_role <> 'leitura') and not public.admin_can('admins') then
      raise exception 'not_authorized: só um superadmin pode definir admin/papel' using errcode = '42501';
    end if;
    if (coalesce(new.is_admin, false) or new.admin_role <> 'leitura') then
      perform public.require_recent_mfa();
    end if;
    return new;
  end if;

  if (new.is_admin is distinct from old.is_admin or new.admin_role is distinct from old.admin_role)
     and not public.admin_can('admins') then
    raise exception 'not_authorized: só um superadmin pode definir admin/papel' using errcode = '42501';
  end if;

  if new.is_admin is distinct from old.is_admin or new.admin_role is distinct from old.admin_role then
    perform public.require_recent_mfa();
  end if;

  -- não deixar o sistema sem superadmin (rebaixar ou remover o último)
  if old.is_admin and old.admin_role = 'superadmin'
     and (not new.is_admin or new.admin_role <> 'superadmin')
     and not exists (
       select 1 from public.profiles p
       where p.id <> old.id and p.is_admin and p.admin_role = 'superadmin'
     ) then
    raise exception 'last_superadmin: precisa existir ao menos um superadmin' using errcode = '42501';
  end if;

  return new;
end;
$$;
