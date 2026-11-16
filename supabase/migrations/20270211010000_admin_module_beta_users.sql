-- Painel admin: liberar um modulo de esporte (EAFIT Run) so para contas
-- escolhidas, sem liberar para todo mundo.
--
-- O app ja le app_metadata.beta_modules da propria sessao (withBetaModules em
-- app-react/src/lib/sportModule.js): quem tem o modulo ali ve o seletor de
-- esporte mesmo com o modulo desligado para todos. app_metadata so e gravado
-- pelo servidor, entao ninguem se libera sozinho. Estas funcoes sao o jeito de
-- o admin mexer nisso pelo painel, e cada mudanca vai para admin_audit_log.
-- Vale para a pessoa na proxima renovacao da sessao (ate 1 h) ou num novo login.

create or replace function public.admin_module_beta_users(p_module text)
returns table (bu_user uuid, bu_email text, bu_name text)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  return query
    select u.id, u.email::text,
           coalesce(nullif(btrim(u.raw_user_meta_data->>'nome'), ''), u.email::text)
    from auth.users u
    where (u.raw_app_meta_data->'beta_modules') ? p_module
    order by lower(u.email::text);
end;
$$;

create or replace function public.admin_set_module_beta(p_user uuid, p_module text, p_on boolean)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_list jsonb;
  next_list jsonb;
begin
  if not public.is_admin() then raise exception 'not_authorized'; end if;
  if p_module not in ('corrida') then raise exception 'invalid_module'; end if;

  select coalesce(u.raw_app_meta_data->'beta_modules', '[]'::jsonb) into current_list
  from auth.users u where u.id = p_user;
  if not found then raise exception 'not_found'; end if;
  if jsonb_typeof(current_list) <> 'array' then current_list := '[]'::jsonb; end if;

  select coalesce(jsonb_agg(distinct s.v), '[]'::jsonb) into next_list
  from (
    select x.v from jsonb_array_elements_text(current_list) x(v) where x.v <> p_module
    union
    select p_module where p_on
  ) s;

  update auth.users
  set raw_app_meta_data = jsonb_set(coalesce(raw_app_meta_data, '{}'::jsonb), '{beta_modules}', next_list)
  where id = p_user;

  insert into public.admin_audit_log (admin_id, target_user_id, action, details)
  values (auth.uid(), p_user, case when p_on then 'module_beta_on' else 'module_beta_off' end,
          jsonb_build_object('module', p_module));
end;
$$;

revoke all on function public.admin_module_beta_users(text) from public, anon;
revoke all on function public.admin_set_module_beta(uuid, text, boolean) from public, anon;
grant execute on function public.admin_module_beta_users(text) to authenticated;
grant execute on function public.admin_set_module_beta(uuid, text, boolean) to authenticated;
