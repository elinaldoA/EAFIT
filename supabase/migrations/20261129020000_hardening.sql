-- Blindagem depois da auditoria de segurança de 2026-10-21. A base já estava
-- boa (RLS em todas as tabelas, search_path fixo em todas as funções security
-- definer, trava de is_admin/admin_role, tetos diários nas tabelas anônimas);
-- isto fecha o que sobrou:
--
-- 1. Funções admin_* antigas ainda executáveis por anon. Todas conferem
--    is_admin() por dentro, então não vazavam nada, mas não há motivo para um
--    visitante sem login conseguir chamá-las. is_admin/admin_can ficam como
--    estão: são usadas dentro de policies que anon também avalia.
-- 2. Buckets sem limite de tamanho e tipo. `avatars` é público e o app nem usa
--    (o avatar fica em profiles.avatar_data): qualquer conta podia hospedar
--    qualquer arquivo, de qualquer tamanho, num endereço nosso.
-- 3. Colunas de texto que o próprio usuário grava, sem teto de tamanho. Os
--    limites ficam bem acima do que o app manda (maiores valores atuais:
--    avatar 22 KB, foto 97 KB, nomes de exercício 42 caracteres).

-- ---------------------------------------------------------------------------
-- 1. admin_* fora do alcance de anon
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname like 'admin\_%'
      and has_function_privilege('anon', p.oid, 'execute')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Buckets: tamanho e tipo
-- ---------------------------------------------------------------------------
update storage.buckets
set file_size_limit = 1048576, -- 1 MB
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';

update storage.buckets
set file_size_limit = 5242880, -- 5 MB (o app manda JPEG de até 1024 px)
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'progress-photos';

-- ---------------------------------------------------------------------------
-- 3. Teto de tamanho nas colunas de texto gravadas pelo usuário
-- ---------------------------------------------------------------------------
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('achievements',        'badge_id',      64),
      ('exercise_discomfort', 'exercise_name', 120),
      ('exercise_discomfort', 'note',          1000),
      ('exercise_logs',       'exercise_name', 120),
      ('exercise_logs',       'reps',          60),
      ('exercise_logs',       'rest_time',     30),
      ('exercise_logs',       'series',        30),
      ('exercise_logs',       'technique',     300),
      ('exercise_sets',       'exercise_name', 120),
      ('feedback',            'context',       2000),
      ('plan_days',           'dia',           30),
      ('plan_days',           'foco',          120),
      ('plan_exercises',      'nome',          120),
      ('plan_exercises',      'reps',          60),
      ('plan_exercises',      'series',        30),
      ('plan_exercises',      'descanso',      30),
      ('plan_exercises',      'tecnica',       300),
      ('profiles',            'email',         320),
      ('profiles',            'avatar_data',   1500000),
      ('progress_photos',     'image_data',    3000000),
      ('progress_photos',     'note',          1000),
      ('progress_photos',     'storage_path',  200),
      ('push_subscriptions',  'endpoint',      1000),
      ('push_subscriptions',  'p256dh',        200),
      ('push_subscriptions',  'auth',          100),
      ('weight_logs',         'notes',         1000),
      ('workout_plans',       'name',          120),
      ('workouts',            'day_of_week',   30),
      ('workouts',            'notes',         2000)
    ) as v(tbl, col, max_len)
  loop
    if not exists (
      select 1 from pg_constraint
      where conrelid = format('public.%I', c.tbl)::regclass
        and conname = format('%s_%s_len', c.tbl, c.col)
    ) then
      execute format(
        'alter table public.%I add constraint %I check (length(%I) <= %s)',
        c.tbl, format('%s_%s_len', c.tbl, c.col), c.col, c.max_len
      );
    end if;
  end loop;
end $$;
