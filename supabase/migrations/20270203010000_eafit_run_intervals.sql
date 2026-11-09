-- EAFIT Run: resultado de cada tiro do treino intervalado.
--
-- runs.intervals: lista [{ "rep": 1, "s": 98, "m": 402 }, ...] com o número do
-- tiro, o tempo (s) e a distância (m) de cada tiro forte do treino guiado
-- (modules/corrida/workout.js). null em corrida sem tiros. O app mostra o
-- ritmo de cada tiro na corrida e no histórico. Privado como o resto da linha
-- (política "own all" de public.runs) e apagado junto com a conta (cascade).
-- O app funciona antes desta migration: sem a coluna, a corrida salva sem os tiros.

alter table public.runs
  add column if not exists intervals jsonb;

alter table public.runs drop constraint if exists runs_intervals_shape;
alter table public.runs add constraint runs_intervals_shape
  check (intervals is null or (jsonb_typeof(intervals) = 'array' and jsonb_array_length(intervals) <= 60 and octet_length(intervals::text) <= 8000));
