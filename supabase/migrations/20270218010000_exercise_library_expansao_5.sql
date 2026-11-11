-- Expansão 5 da biblioteca: ativação de glúteos (concha), peito e costas com halteres, peso corporal e core.
-- Cada exercício entra junto com o vídeo de execução em app-react/src/data/exerciseYoutube.js
-- e o inglês em app-react/src/i18n/en/exercises.js. on conflict (nome) do nothing: reaplicar não duplica.
insert into public.exercise_library
  (nome, grupo_muscular, tipo, equipamento, series, reps, descanso, tecnica, is_post_workout, nivel_minimo)
values
('Concha Lateral (Clamshell)', 'gluteos', 'isolado', 'peso corporal', '3', '15-20 cada', '30s', 'Deitado de lado, joelhos dobrados, abre o joelho de cima sem girar o quadril', false, 'iniciante'),
('Concha com Elástico', 'gluteos', 'isolado', 'elástico', '3', '15-20 cada', '30s', 'Elástico acima dos joelhos, abre o joelho de cima contra a resistência', false, 'iniciante'),
('Crucifixo no Chão com Halteres', 'peito', 'isolado', 'halteres', '3', '10-12', '60s', 'Cotovelos levemente flexionados, desce até tocar o chão e fecha em arco', false, 'iniciante'),
('Remada Apoiada no Banco Inclinado com Halteres', 'costas', 'composto', 'halteres', '3', '10-12', '60s', 'Peito apoiado no banco, puxa os cotovelos para trás sem tirar o peito', false, 'iniciante'),
('Flexão Larga', 'peito', 'composto', 'peso corporal', '3', '10-15', '60s', 'Mãos mais afastadas que os ombros, corpo reto, peito quase no chão', false, 'iniciante'),
('Agachamento Goblet com Pausa', 'quadriceps', 'composto', 'kettlebell', '3', '8-10', '75s', 'Kettlebell junto ao peito, pausa de 2s embaixo e sobe com o peito aberto', false, 'iniciante'),
('Moinho com Halter', 'core', 'isolado', 'halteres', '3', '8-10 cada', '60s', 'Halter acima da cabeça, desliza a mão pela perna mantendo o braço estendido', false, 'intermediario')
on conflict (nome) do nothing;
