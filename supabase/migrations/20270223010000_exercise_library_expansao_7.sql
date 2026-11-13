-- Expansão 7 da biblioteca: Agachamento Hack Unilateral (vídeo do canal Legacy Health and Performance
-- em app-react/src/data/exerciseYoutube.js e inglês em app-react/src/i18n/en/exercises.js).
-- on conflict (nome) do nothing: reaplicar não duplica.
insert into public.exercise_library
  (nome, grupo_muscular, tipo, equipamento, series, reps, descanso, tecnica, is_post_workout, nivel_minimo)
values
('Agachamento Hack Unilateral', 'quadriceps', 'composto', 'máquina', '3', '8-12 cada', '75s', 'Uma perna por vez', false, 'intermediario')
on conflict (nome) do nothing;
