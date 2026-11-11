-- Expansão 4 da biblioteca: lacunas de condomínio/casa (kettlebell e halteres) e ombro
-- composto. Cada exercício entra junto com o vídeo de execução em
-- app-react/src/data/exerciseYoutube.js e o inglês em app-react/src/i18n/en/exercises.js.
-- on conflict (nome) do nothing: reaplicar não duplica nem sobrescreve.
insert into public.exercise_library
  (nome, grupo_muscular, tipo, equipamento, series, reps, descanso, tecnica, is_post_workout, nivel_minimo)
values
('Rosca Martelo com Kettlebell', 'biceps', 'isolado', 'kettlebell', '3', '12-15', '45s', 'Segura as laterais da alça, punhos neutros, cotovelos colados', false, 'iniciante'),
('Rosca Martelo Cruzada com Halteres', 'biceps', 'isolado', 'halteres', '3', '10-12', '45s', 'Leva o halter em direção ao ombro oposto, sem balançar o tronco', false, 'iniciante'),
('Afundo com Kettlebell', 'quadriceps', 'composto', 'kettlebell', '3', '10-12 cada', '60s', 'Passo largo, tronco ereto, joelho de trás quase no chão', false, 'iniciante'),
('Afundo Búlgaro com Kettlebell', 'quadriceps', 'composto', 'kettlebell', '3', '8-10 cada', '75s', 'Pé de trás no banco, tronco ereto, desce até a coxa ficar paralela', false, 'intermediario'),
('Clean e Press com Halteres', 'ombro', 'composto', 'halteres', '4', '6-8', '90s', 'Impulso dos quadris leva os halteres aos ombros, depois empurra acima da cabeça', false, 'intermediario'),
('Clean e Press com Kettlebell', 'ombro', 'composto', 'kettlebell', '4', '6-8', '90s', 'Impulso dos quadris leva o kettlebell ao ombro, depois empurra acima da cabeça', false, 'intermediario')
on conflict (nome) do nothing;
