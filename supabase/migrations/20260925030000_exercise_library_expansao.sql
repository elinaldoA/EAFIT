-- Amplia a biblioteca de exercícios (20260821020000_exercise_library.sql)
-- nos grupos em que o sorteio da geração automática de treino tinha pouca
-- variedade: tríceps composto (3), quadríceps isolado (4), posterior de coxa
-- isolado (4), glúteos composto (5) e costas isolado (5). Também entra uma
-- leva menor pros demais grupos, com mais opções de máquina/peso corporal
-- (iniciante e treino em casa) e de core/cardio pro pós-treino.
--
-- Mesmos critérios da migration original:
-- - nomes reais e sem duplicata disfarçada: "Peck Deck" (= Crucifixo
--   Máquina), "Remada Cavalinho" (= Remada com Barra T) e "Remada Serrote"
--   (= Remada Unilateral com Halter) ficaram de fora de propósito — histórico
--   de carga e recordes são agrupados pelo nome, e dois nomes pro mesmo
--   exercício partiriam a evolução do usuário;
-- - "Afundo Búlgaro", não "Agachamento Búlgaro"; "Farmer Walk" com o nome
--   exato já usado em treinoData.js/workout_templates, pra herdar o histórico;
-- - composto 4 × 8-10 / 90s, isolado 3 × 12-15 / 45s, salvo isometrias e
--   exercícios por lado;
-- - nivel_minimo: guiados/peso corporal simples no iniciante; livres
--   técnicos no intermediário; explosão, alavanca longa ou excêntrica pesada
--   no avançado.
--
-- on conflict (nome) do nothing: reaplicar a migration (ou um admin já ter
-- cadastrado algum destes pelo painel) não duplica nem sobrescreve.
insert into public.exercise_library
  (nome, grupo_muscular, tipo, equipamento, series, reps, descanso, tecnica, is_post_workout, nivel_minimo)
values
-- Peito
('Supino Inclinado no Smith', 'peito', 'composto', 'máquina', '4', '8-10', '90s', 'Banco a 30°, barra na linha do peito superior', false, 'iniciante'),
('Supino Inclinado na Máquina', 'peito', 'composto', 'máquina', '4', '8-10', '90s', 'Escápulas encaixadas no encosto', false, 'iniciante'),
('Flexão de Braço Inclinada (Mãos no Banco)', 'peito', 'composto', 'peso corporal', '4', '10-12', '60s', 'Versão mais leve da flexão, corpo alinhado', false, 'iniciante'),
('Flexão Declinada (Pés no Banco)', 'peito', 'composto', 'peso corporal', '4', '8-10', '90s', 'Foco peito superior, core firme', false, 'intermediario'),
('Crucifixo Declinado com Halteres', 'peito', 'isolado', 'halteres', '3', '12-15', '45s', 'Foco peito inferior, arco aberto', false, 'iniciante'),
('Crucifixo Unilateral na Polia', 'peito', 'isolado', 'polia', '3', '12-15', '45s', 'Um braço por vez, cruza a linha média', false, 'iniciante'),

-- Costas
('Puxada Supinada (Pegada Fechada)', 'costas', 'composto', 'polia', '4', '8-10', '90s', 'Palmas pra você, cotovelos rente ao corpo', false, 'iniciante'),
('Remada Baixa Unilateral na Polia', 'costas', 'composto', 'polia', '4', '10-12', '75s', 'Rotação leve do tronco no alongamento', false, 'iniciante'),
('Remada Pendlay', 'costas', 'composto', 'barra', '4', '6-8', '2min', 'Barra parte do chão a cada repetição, tronco paralelo', false, 'avancado'),
('Remada Meadows', 'costas', 'composto', 'barra', '4', '8-10', '90s', 'Barra ancorada, pegada na ponta, um lado por vez', false, 'avancado'),
('Pullover na Máquina', 'costas', 'isolado', 'máquina', '3', '12-15', '45s', 'Foco dorsal, braços quase estendidos', false, 'iniciante'),
('Encolhimento na Polia', 'costas', 'isolado', 'polia', '3', '12-15', '45s', 'Pausa de 1s no topo', false, 'iniciante'),
('Superman (Extensão Lombar no Solo)', 'costas', 'isolado', 'peso corporal', '3', '12-15', '45s', 'Eleva braços e pernas juntos, sem tranco', false, 'iniciante'),

-- Ombro
('Desenvolvimento no Smith', 'ombro', 'composto', 'máquina', '4', '8-10', '90s', 'Sentado, barra desce até o queixo', false, 'iniciante'),
('Desenvolvimento Unilateral com Halter', 'ombro', 'composto', 'halteres', '4', '8-10', '90s', 'Em pé, core travado contra a inclinação', false, 'intermediario'),
('Landmine Press', 'ombro', 'composto', 'barra', '4', '8-10', '90s', 'Barra ancorada, empurra na diagonal', false, 'intermediario'),
('Elevação em Y no Banco Inclinado', 'ombro', 'isolado', 'halteres', '3', '12-15', '45s', 'Peito no banco, braços sobem em Y', false, 'iniciante'),
('Crucifixo Invertido na Polia', 'ombro', 'isolado', 'polia', '3', '12-15', '45s', 'Cabos cruzados, foco deltoide posterior', false, 'iniciante'),
('Rotação Externa na Polia', 'ombro', 'isolado', 'polia', '3', '12-15', '45s', 'Cotovelo colado ao corpo, carga leve', false, 'iniciante'),

-- Bíceps
('Rosca Inclinada com Halteres', 'biceps', 'isolado', 'halteres', '3', '10-12', '60s', 'Banco a 45°, braços atrás do tronco', false, 'iniciante'),
('Rosca Martelo na Polia (Corda)', 'biceps', 'isolado', 'polia', '3', '12-15', '45s', 'Pegada neutra, foco braquial', false, 'iniciante'),
('Rosca Scott na Máquina', 'biceps', 'isolado', 'máquina', '3', '12-15', '45s', 'Braço apoiado, sem estender por completo', false, 'iniciante'),
('Rosca Zottman', 'biceps', 'isolado', 'halteres', '3', '10-12', '60s', 'Sobe supinado, desce pronado e devagar', false, 'intermediario'),

-- Tríceps
('Supino Fechado no Smith', 'triceps', 'composto', 'máquina', '4', '8-10', '90s', 'Pegada na largura dos ombros, cotovelos fechados', false, 'iniciante'),
('Mergulho na Máquina', 'triceps', 'composto', 'máquina', '4', '10-12', '75s', 'Tronco ereto, foco tríceps', false, 'iniciante'),
('Flexão Diamante', 'triceps', 'composto', 'peso corporal', '4', '8-10', '90s', 'Mãos juntas formando um losango', false, 'intermediario'),
('Tríceps Francês na Polia (Corda)', 'triceps', 'isolado', 'polia', '3', '12-15', '45s', 'De costas pra polia, alongamento acima da cabeça', false, 'iniciante'),
('Tríceps Pulley Pegada Invertida', 'triceps', 'isolado', 'polia', '3', '12-15', '45s', 'Palmas pra cima, foco cabeça medial', false, 'iniciante'),

-- Quadríceps
('Afundo Búlgaro no Smith', 'quadriceps', 'composto', 'máquina', '4', '8-10', '90s', 'Pé de trás no banco, barra guiada', false, 'iniciante'),
('Agachamento Pendulum', 'quadriceps', 'composto', 'máquina', '4', '8-10', '90s', 'Amplitude profunda, lombar apoiada', false, 'iniciante'),
('Pistol Squat Assistido', 'quadriceps', 'composto', 'peso corporal', '3', '6-8 cada perna', '90s', 'Segura num apoio, desce numa perna só', false, 'intermediario'),
('Cadeira Extensora Unilateral', 'quadriceps', 'isolado', 'máquina', '3', '12-15', '45s', 'Uma perna por vez, pausa de 1s no topo', false, 'iniciante'),
('Extensão de Joelho com Caneleira', 'quadriceps', 'isolado', 'caneleira', '3', '15-20', '45s', 'Sentado, estende e segura 1s', false, 'iniciante'),
('Sissy Squat', 'quadriceps', 'isolado', 'peso corporal', '3', '10-12', '60s', 'Joelhos à frente, tronco inclinado pra trás', false, 'avancado'),

-- Posterior de coxa
('Stiff Unilateral com Halter', 'posterior_coxa', 'composto', 'halteres', '4', '8-10 cada perna', '90s', 'Quadril nivelado, perna de trás sobe junto', false, 'intermediario'),
('Flexora Deitado com Halter', 'posterior_coxa', 'isolado', 'halteres', '3', '12-15', '45s', 'Halter preso entre os pés, sem tirar o quadril do banco', false, 'intermediario'),
('Flexão de Pernas na Bola Suíça', 'posterior_coxa', 'isolado', 'bola', '3', '12-15', '45s', 'Quadril elevado durante toda a série', false, 'iniciante'),
('Flexora em Pé com Caneleira', 'posterior_coxa', 'isolado', 'caneleira', '3', '15-20', '45s', 'Apoiado, calcanhar em direção ao glúteo', false, 'iniciante'),

-- Glúteos
('Elevação Pélvica na Máquina', 'gluteos', 'composto', 'máquina', '4', '8-10', '90s', 'Pausa de 2s no topo', false, 'iniciante'),
('Elevação Pélvica no Smith', 'gluteos', 'composto', 'máquina', '4', '8-10', '90s', 'Costas no banco, queixo recolhido', false, 'iniciante'),
('Pull Through na Polia', 'gluteos', 'composto', 'polia', '4', '12-15', '60s', 'Dobradiça de quadril, estende contraindo o glúteo', false, 'iniciante'),
('Abdução de Quadril na Polia', 'gluteos', 'isolado', 'polia', '3', '12-15 cada lado', '45s', 'Caneleira da polia no tornozelo, sem girar o tronco', false, 'iniciante'),
('Caminhada Lateral com Mini Band', 'gluteos', 'isolado', 'elástico', '3', '15 passos cada lado', '45s', 'Semi-agachado, tensão constante no elástico', false, 'iniciante'),

-- Panturrilha
('Panturrilha no Smith', 'panturrilha', 'isolado', 'máquina', '3', '12-15', '45s', 'Ponta dos pés num step, alongamento completo', false, 'iniciante'),
('Panturrilha Sentado com Halteres', 'panturrilha', 'isolado', 'halteres', '3', '15-20', '45s', 'Halteres nos joelhos, pausa no topo', false, 'iniciante'),

-- Core (pós-treino)
('Hollow Hold (Canoa)', 'core', 'isolado', 'peso corporal', '3', '30s', '30s', 'Lombar colada no chão', true, 'iniciante'),
('Mountain Climber', 'core', 'isolado', 'peso corporal', '3', '30s', '30s', 'Quadril baixo, ritmo constante', true, 'iniciante'),
('Abdominal Canivete (V-Up)', 'core', 'isolado', 'peso corporal', '3', '12-15', '45s', 'Tronco e pernas sobem juntos', true, 'intermediario'),
('Bird Dog', 'core', 'isolado', 'peso corporal', '3', '10 cada lado', '30s', 'Braço e perna opostos, sem girar o quadril', true, 'iniciante'),
('Lenhador na Polia (Woodchopper)', 'core', 'isolado', 'polia', '3', '12 cada lado', '45s', 'Rotação a partir do tronco, braços estendidos', true, 'iniciante'),
('Farmer Walk', 'core', 'isolado', 'halteres', '3', '30s', '60s', 'Grip + Core, ombros encaixados', true, 'iniciante'),

-- Cardio (pós-treino)
('Air Bike (Assault Bike)', 'cardio', 'cardio', 'máquina', '-', '10x20s forte', '40s', 'Braços e pernas juntos', true, 'intermediario'),
('Burpee', 'cardio', 'cardio', 'peso corporal', '-', '5x1min', '30s', 'Ritmo sustentável', true, 'iniciante'),
('Polichinelo', 'cardio', 'cardio', 'peso corporal', '-', '10min', '-', 'Aquecimento ou cardio leve', true, 'iniciante'),
('Natação', 'cardio', 'cardio', 'piscina', '-', '30min · Moderado', '-', 'Estilo livre, respiração ritmada', true, 'iniciante')
on conflict (nome) do nothing;
