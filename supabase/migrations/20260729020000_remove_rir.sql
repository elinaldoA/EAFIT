-- Reverte a coluna rir adicionada em 20260729010000_treino_rir_e_limpeza.sql:
-- a UI que a preenchia (botões Fácil/Moderado/Difícil/Falha por série) foi
-- removida no commit seguinte por deixar a tela poluída, e nenhuma outra tela
-- ganhou um jeito de informar RIR desde então — a coluna ficou morta (sempre
-- null em qualquer série registrada depois da remoção).

alter table public.exercise_sets
  drop constraint if exists exercise_sets_rir_check;

alter table public.exercise_sets
  drop column if exists rir;
