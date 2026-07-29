-- Adiciona RIR (reps in reserve) opcional por série, e limpa dados legados
-- confirmados sem uso por nenhum código atual:
--   • personal_records: PRs já são calculados on-the-fly a partir de
--     exercise_sets (lib/records.js) — nenhum código faz .from('personal_records').
--   • exercise_logs.carga_sem1..carga_sem4/notes: resquício de um esquema de
--     progressão semanal anterior ao exercise_sets atual (por série);
--     exercise_logs hoje é só o snapshot estático do treino planejado.
-- workouts.notes fica — passa a ser usado como nota de sessão do treino.

alter table public.exercise_sets
  add column if not exists rir smallint;

alter table public.exercise_sets
  drop constraint if exists exercise_sets_rir_check;

alter table public.exercise_sets
  add constraint exercise_sets_rir_check check (rir is null or (rir >= 0 and rir <= 4));

drop table if exists public.personal_records cascade;

alter table public.exercise_logs
  drop column if exists carga_sem1,
  drop column if exists carga_sem2,
  drop column if exists carga_sem3,
  drop column if exists carga_sem4,
  drop column if exists notes;
