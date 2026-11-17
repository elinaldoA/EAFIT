-- RPCs de escrita do painel que só checavam is_admin(): qualquer admin, até o
-- papel "Só leitura", conseguia chamá-las direto pela API (a tela só
-- desabilitava o botão). Passam a exigir a área certa, a mesma que o painel
-- usa em RequireArea:
--   admins   -> limpeza de dados antigos e publicação de termos/privacidade
--   users    -> personal, moderação do feed e amizades
--   settings -> beta de módulos
--   content  -> desafios
-- Reescreve só a primeira checagem de cada função (mantém o corpo atual).
do $$
declare
  r record;
  v_def text;
  v_new text;
begin
  for r in
    select * from (values
      ('public.admin_publish_legal_version(text,text,date,text)', 'admins'),
      ('public.admin_purge_stats(int)',                           'admins'),
      ('public.admin_purge_old(text,int)',                        'admins'),
      ('public.admin_set_trainer(uuid,boolean)',                  'users'),
      ('public.admin_set_feed_block(uuid,boolean)',               'users'),
      ('public.admin_delete_feed_event(bigint)',                  'users'),
      ('public.admin_remove_friendship(bigint)',                  'users'),
      ('public.admin_set_module_beta(uuid,text,boolean)',         'settings'),
      ('public.admin_delete_challenge(uuid)',                     'content')
    ) as t(fn, area)
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    v_new := replace(v_def, 'if not public.is_admin() then',
                     format('if not public.admin_can(%L) then', r.area));
    if v_new = v_def then
      -- já usa admin_can (rodada repetida) ou o corpo mudou: não mexe
      continue;
    end if;
    execute v_new;
  end loop;
end $$;
