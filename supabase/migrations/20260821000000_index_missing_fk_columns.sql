-- Índices faltando em colunas de FK/user_id que são filtradas o tempo todo —
-- tanto pelas policies de RLS (plan_days/plan_exercises fazem subquery/join
-- por plan_id/plan_day_id em toda leitura; exercise_logs faz EXISTS por
-- workout_id) quanto pelo próprio app (fetchPlanDays filtra plan_days por
-- plan_id e plan_exercises por plan_day_id; delete-account/admin-users
-- filtram exercise_logs por workout_id ao excluir conta). Sem índice, cada
-- uma dessas consultas faz sequential scan — hoje irrelevante com poucas
-- linhas, mas cresce com a base de usuários.
--
-- Não inclui toda coluna user_id da base: water_logs, weight_logs e
-- achievements já têm uma UNIQUE (user_id, ...) que serve de índice pra
-- busca por user_id (coluna mais à esquerda); exercise_sets já tem
-- exercise_sets_workout_idx; exercise_discomfort já tem
-- exercise_discomfort_user_exercise_idx. Tabelas só de admin
-- (admin_audit_log, scheduled_broadcasts) ficam de fora por enquanto — baixo
-- volume, acesso só pelo backoffice.

create index if not exists plan_days_plan_id_idx on public.plan_days (plan_id);
create index if not exists plan_exercises_plan_day_id_idx on public.plan_exercises (plan_day_id);
create index if not exists exercise_logs_workout_id_idx on public.exercise_logs (workout_id);
create index if not exists workouts_user_id_idx on public.workouts (user_id);
create index if not exists workout_plans_user_id_idx on public.workout_plans (user_id);
create index if not exists progress_photos_user_id_idx on public.progress_photos (user_id);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
