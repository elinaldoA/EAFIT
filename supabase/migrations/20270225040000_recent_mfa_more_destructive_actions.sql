-- Código do autenticador recente (recent_mfa, ver 20270225030000) também nas
-- outras ações destrutivas do painel, para quem chama a API direto:
--   * apagar desafio                       (admin_delete_challenge)
--   * remover o acesso de personal         (admin_set_trainer com p_on = false;
--                                           liberar não pede: a aprovação do CREF
--                                           chama a mesma função)
--   * encerrar vínculo personal-aluno      (admin_revoke_trainer_link; de quebra
--                                           passa a exigir a área 'users', a mesma
--                                           da tela Personais)
--   * apagar pesquisa                      (policy de delete em surveys)
--   * ligar manutenção ou mudança de endereço do app (trigger em app_settings;
--                                           desligar não pede, é a saída do apuro)
-- Corpos atuais das funções mantidos; rodar de novo não repete nada.

do $$
declare
  r record;
  v_def text;
  v_old text;
  v_new text;
begin
  for r in
    select * from (values
      -- função, checagem que existe hoje, checagem nova, exigência que entra logo depois
      ('public.admin_delete_challenge(uuid)',
        'if not public.admin_can(''content'') then raise exception ''not_authorized''; end if;',
        'if not public.admin_can(''content'') then raise exception ''not_authorized''; end if;',
        'perform public.require_recent_mfa();'),
      ('public.admin_set_trainer(uuid,boolean)',
        'if not public.admin_can(''users'') then raise exception ''not_authorized''; end if;',
        'if not public.admin_can(''users'') then raise exception ''not_authorized''; end if;',
        'if not p_on then perform public.require_recent_mfa(); end if;'),
      ('public.admin_revoke_trainer_link(uuid,uuid)',
        'if not public.is_admin() then raise exception ''not_authorized''; end if;',
        'if not public.admin_can(''users'') then raise exception ''not_authorized''; end if;',
        'perform public.require_recent_mfa();')
    ) as t(fn, old_check, new_check, extra)
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    if position('require_recent_mfa' in v_def) > 0 then
      continue; -- rodada repetida
    end if;
    v_old := r.old_check;
    v_new := replace(v_def, v_old, r.new_check || E'\n  ' || r.extra);
    if v_new = v_def then
      raise exception 'não achei a checagem de área em %: aplique antes 20270225010000 e 20270225030000', r.fn;
    end if;
    execute v_new;
  end loop;
end $$;

-- Apagar pesquisa.
drop policy if exists "surveys_delete_m" on public.surveys;
create policy "surveys_delete_m" on public.surveys as permissive for delete to public
  using (admin_can('content'::text) and recent_mfa());

-- Ligar manutenção ou mudança de endereço do app: bloqueiam todo mundo.
create or replace function public.guard_app_settings_sensitive()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.key in ('maintenance', 'moved')
     and coalesce(new.value ->> 'enabled', 'false') = 'true'
     and (tg_op = 'INSERT' or coalesce(old.value ->> 'enabled', 'false') <> 'true') then
    perform public.require_recent_mfa();
  end if;
  return new;
end;
$$;

drop trigger if exists guard_app_settings_sensitive on public.app_settings;
create trigger guard_app_settings_sensitive
  before insert or update on public.app_settings
  for each row execute function public.guard_app_settings_sensitive();
