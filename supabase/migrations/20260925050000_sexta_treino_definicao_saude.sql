-- Os templates de 'definicao' e 'saude' tinham a Sexta como dia sem treino
-- ("Cardio Leve / Recuperação" e "Descanso Total"). Como a semana de treino
-- do app é Segunda–Sexta (TreinoPage conta os 5 dias úteis como treinos da
-- semana), "Gerar novo treino" parecia gerar só até Quinta, com a Sexta vazia.
-- Aqui a Sexta vira um dia de "Superiores" — foco mapeado em FOCO_TO_GRUPOS
-- (app-react/src/data/exerciseLibrary.js), então generatePlan ainda sorteia os
-- exercícios da biblioteca; os abaixo são o fallback do template. Espelha os
-- arrays DEFINICAO/SAUDE de app-react/src/data/workoutTemplates.js.
--
-- Só troca a Sexta (índice 4) se ela ainda for o dia de descanso/cardio
-- original — não sobrescreve um template que o admin já tenha editado.
-- Planos já gerados não mudam: o usuário precisa gerar um novo treino.

update public.workout_templates
set days = jsonb_set(days, '{4}', $d${"dia":"Sexta","foco":"Superiores","exercicios":[{"nome":"Supino Inclinado com Halteres","series":"3","reps":"10-12","descanso":"60s","tecnica":"Controle na descida"},{"nome":"Remada Unilateral com Halter","series":"3","reps":"10-12","descanso":"60s","tecnica":"Máximo alongamento"},{"nome":"Elevação Lateral com Halteres","series":"3","reps":"12-15","descanso":"45s","tecnica":"Leve inclinação"}],"pos":[{"nome":"🏃 Cardio — Esteira","series":"-","reps":"15min · Moderado","descanso":"-","tecnica":""}]}$d$::jsonb)
where meta = 'definicao'
  and days #>> '{4,dia}' = 'Sexta'
  and days #>> '{4,foco}' = 'Cardio Leve / Recuperação';

update public.workout_templates
set days = jsonb_set(days, '{4}', $d${"dia":"Sexta","foco":"Superiores","exercicios":[{"nome":"Remada Unilateral com Halter","series":"3","reps":"12-15","descanso":"60s","tecnica":"Máximo alongamento"},{"nome":"Supino Inclinado com Halteres","series":"3","reps":"12-15","descanso":"60s","tecnica":"Controle na descida"},{"nome":"Elevação Lateral com Halteres","series":"3","reps":"12-15","descanso":"45s","tecnica":"Leve inclinação"}],"pos":[]}$d$::jsonb)
where meta = 'saude'
  and days #>> '{4,dia}' = 'Sexta'
  and days #>> '{4,foco}' = 'Descanso Total';
