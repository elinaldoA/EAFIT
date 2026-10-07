-- Excluir uma conta (delete-account / admin-users deleteUser) apaga os dados
-- do usuário e por fim o login em auth.users. Quatro chaves estrangeiras
-- ainda impediam esse último passo ou deixavam resíduo:
--  * workouts.user_id, weight_logs.user_id, profiles.id apontavam para
--    auth.users SEM cascade — a exclusão do login só passava porque a Edge
--    Function apagava essas linhas antes. Agora o banco também garante.
--  * admin_audit_log.admin_id e scheduled_broadcasts.created_by (SEM cascade)
--    travavam a exclusão de qualquer conta de admin que tivesse agido no
--    painel: os dados eram apagados e o login ficava, preso. Viram set null
--    (o registro de auditoria e o agendamento continuam, sem o autor).
-- A busca do nome da constraint é dinâmica porque o baseline não as nomeou.
do $$
declare
  fk record;
  spec record;
begin
  for spec in
    select * from (values
      ('workouts',            'user_id',    'cascade'),
      ('weight_logs',         'user_id',    'cascade'),
      ('profiles',            'id',         'cascade'),
      ('admin_audit_log',     'admin_id',   'set null'),
      ('scheduled_broadcasts','created_by', 'set null')
    ) as t(tbl, col, action)
  loop
    if to_regclass('public.' || spec.tbl) is null then continue; end if;

    for fk in
      select c.conname
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.contype = 'f'
        and c.conrelid = ('public.' || spec.tbl)::regclass
        and c.confrelid = 'auth.users'::regclass
        and a.attname = spec.col
        and c.confdeltype = 'a'  -- 'a' = no action (o que queremos trocar)
    loop
      execute format('alter table public.%I drop constraint %I', spec.tbl, fk.conname);
      execute format(
        'alter table public.%I add constraint %I foreign key (%I) references auth.users(id) on delete %s',
        spec.tbl, fk.conname, spec.col, spec.action
      );
    end loop;
  end loop;
end $$;
