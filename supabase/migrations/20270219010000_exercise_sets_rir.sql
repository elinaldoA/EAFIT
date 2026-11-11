-- RIR (reps em reserva) opcional por serie: quantas repeticoes o aluno ainda
-- conseguiria fazer ao terminar. 0 = foi ate a falha, 4 = 4 ou mais sobrando.
-- Preenchido por um toque depois de marcar a serie como feita (SetRow.jsx);
-- continua nulo quando o aluno ignora a pergunta.

alter table public.exercise_sets
  add column if not exists rir smallint;

alter table public.exercise_sets
  drop constraint if exists exercise_sets_rir_check;

alter table public.exercise_sets
  add constraint exercise_sets_rir_check check (rir is null or (rir >= 0 and rir <= 4));
