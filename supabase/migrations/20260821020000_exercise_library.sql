-- Biblioteca de exercícios (grupo muscular, tipo composto/isolado/cardio) pra
-- alimentar seleção "inteligente" por foco na geração automática de treino
-- (ver withLibraryExercises em app-react/src/data/exerciseLibrary.js e o port
-- em supabase/functions/_shared/exerciseLibrary.ts, usado por
-- admin-generate-plan): quando o ciclo de um
-- usuário vence sem sucessor configurado, os dias de treino de força passam a
-- sortear exercícios daqui — compostos primeiro, depois isolados/acessórios —
-- em vez de sempre repetir a mesma lista fixa de workout_templates.days.
--
-- 152 exercícios curados à mão (nomes reais, sem repetição disfarçada) em vez
-- de um volume maior gerado por combinatória, pra manter qualidade didática.
-- is_post_workout marca os itens de core/cardio usados no array `pos` — a
-- seleção (ver exerciseLibrary.js) só usa os exercícios de força
-- (is_post_workout = false) pra montar o array `exercicios`; os itens de pos
-- continuam vindo do template estático por enquanto.
--
-- nivel_minimo: nível de experiência a partir do qual o exercício pode ser
-- sorteado. As trocas por nível de workoutAdjustments.js (LEVEL_EXERCISE_SUBS)
-- só cobrem 10 nomes específicos; sem este filtro, um iniciante podia receber
-- levantamentos livres técnicos (Supino Declinado, Good Morning, Push
-- Press...) que nenhuma troca cobre. Iniciante sorteia só 'iniciante';
-- intermediário, 'iniciante' + 'intermediario'; avançado, todos.
--
-- Nomes alinhados com os já usados em workout_templates / treinoData.js /
-- LEVEL_EXERCISE_SUBS (ex.: "Afundo Búlgaro", não "Agachamento Búlgaro"):
-- histórico de carga e recordes (PRs) são agrupados pelo nome do exercício,
-- então o mesmo exercício com dois nomes quebraria a evolução do usuário.
create table if not exists public.exercise_library (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  grupo_muscular text not null,
  tipo text not null check (tipo in ('composto', 'isolado', 'cardio')),
  equipamento text,
  series text not null default '3',
  reps text not null default '12-15',
  descanso text not null default '45s',
  tecnica text not null default '',
  is_post_workout boolean not null default false,
  nivel_minimo text not null default 'iniciante' check (nivel_minimo in ('iniciante', 'intermediario', 'avancado')),
  created_at timestamptz not null default now()
);

alter table public.exercise_library enable row level security;

drop policy if exists "anyone can read exercise_library" on public.exercise_library;
create policy "anyone can read exercise_library" on public.exercise_library
  for select using (true);

drop policy if exists "admin full access" on public.exercise_library;
create policy "admin full access" on public.exercise_library
  for all using (public.is_admin()) with check (public.is_admin());

create index if not exists exercise_library_grupo_tipo_idx
  on public.exercise_library (grupo_muscular, tipo, is_post_workout);

insert into public.exercise_library (nome, grupo_muscular, tipo, equipamento, series, reps, descanso, tecnica, is_post_workout) values
('Supino Reto com Barra', 'peito', 'composto', 'barra', '4', '8-10', '90s', 'Cadência controlada, cotovelos a 45°', false),
('Supino Reto com Halteres', 'peito', 'composto', 'halteres', '4', '8-10', '90s', 'Amplitude maior que a barra', false),
('Supino Inclinado com Barra', 'peito', 'composto', 'barra', '4', '8-10', '90s', 'Foco peito superior', false),
('Supino Inclinado com Halteres', 'peito', 'composto', 'halteres', '4', '8-10', '90s', 'Alongamento máximo na descida', false),
('Supino Declinado com Barra', 'peito', 'composto', 'barra', '4', '8-10', '90s', 'Foco peito inferior', false),
('Supino Reto no Smith', 'peito', 'composto', 'máquina', '4', '8-10', '90s', 'Trajetória guiada', false),
('Supino Reto na Máquina', 'peito', 'composto', 'máquina', '4', '8-10', '90s', 'Trajetória guiada, foco execução', false),
('Paralelas (Peito)', 'peito', 'composto', 'peso corporal', '4', '8-10', '90s', 'Tronco inclinado à frente', false),
('Flexão de Braço', 'peito', 'composto', 'peso corporal', '4', '8-10', '90s', 'Core travado, amplitude completa', false),
('Crucifixo Reto com Halteres', 'peito', 'isolado', 'halteres', '3', '12-15', '45s', 'Cotovelos levemente flexionados', false),
('Crucifixo Inclinado com Halteres', 'peito', 'isolado', 'halteres', '3', '12-15', '45s', 'Foco peito superior', false),
('Crucifixo na Polia (Cross Over)', 'peito', 'isolado', 'polia', '3', '12-15', '45s', 'Cruza as mãos no final do movimento', false),
('Crucifixo Máquina', 'peito', 'isolado', 'máquina', '3', '12-15', '45s', 'Pico de contração', false),
('Voador Inclinado na Polia', 'peito', 'isolado', 'polia', '3', '12-15', '45s', 'Ângulo de baixo pra cima', false),
('Crossover Baixo (Peito Superior)', 'peito', 'isolado', 'polia', '3', '12-15', '45s', 'Puxada de baixo pra cima', false),
('Cross Over Alto (Peito Inferior)', 'peito', 'isolado', 'polia', '3', '12-15', '45s', 'Puxada de cima pra baixo', false),
('Pullover com Halter', 'peito', 'isolado', 'halteres', '3', '12-15', '45s', 'Foco peitoral e serrátil', false),
('Supino Fechado com Barra', 'peito', 'composto', 'barra', '4', '8-10', '90s', 'Pegada fechada, foco peito interno/tríceps', false),
('Levantamento Terra', 'costas', 'composto', 'barra', '4', '8-10', '90s', 'Quadril e core travados', false),
('Puxada Aberta Frente', 'costas', 'composto', 'polia', '4', '8-10', '90s', 'Tronco levemente inclinado', false),
('Pulldown Neutro (Triângulo)', 'costas', 'composto', 'polia', '4', '8-10', '90s', 'Pegada neutra, cotovelos ao corpo', false),
('Remada Curvada com Barra', 'costas', 'composto', 'barra', '4', '8-10', '90s', 'Escápula ativa', false),
('Remada com Barra T', 'costas', 'composto', 'barra', '4', '8-10', '90s', 'Peito apoiado ou tronco livre', false),
('Remada Unilateral com Halter', 'costas', 'composto', 'halteres', '4', '8-10', '90s', 'Máximo alongamento', false),
('Remada Baixa na Polia', 'costas', 'composto', 'polia', '4', '8-10', '90s', 'Tronco ereto, puxa até o abdômen', false),
('Remada Máquina Articulada', 'costas', 'composto', 'máquina', '4', '8-10', '90s', 'Trajetória guiada', false),
('Barra Fixa (peso corporal)', 'costas', 'composto', 'peso corporal', '4', '8-10', '90s', 'Amplitude completa', false),
('Barra Fixa Assistida', 'costas', 'composto', 'máquina', '4', '8-10', '90s', 'Contrapeso reduz o peso corporal', false),
('Puxada Alta na Polia (Pegada Aberta)', 'costas', 'composto', 'polia', '4', '8-10', '90s', 'Cotovelos apontando pra baixo', false),
('Pulldown na Polia (Braços Estendidos)', 'costas', 'isolado', 'polia', '3', '12-15', '45s', 'Foco dorsal, cotovelos quase travados', false),
('Pull-Over na Polia Alta', 'costas', 'isolado', 'polia', '3', '12-15', '45s', 'Foco dorsal e serrátil', false),
('Remada Sirena (Seal Row)', 'costas', 'composto', 'barra', '4', '8-10', '90s', 'Peito apoiado em banco inclinado, isola dorsais', false),
('Encolhimento com Halteres', 'costas', 'isolado', 'halteres', '3', '12-15', '45s', 'Foco trapézio', false),
('Encolhimento com Barra', 'costas', 'isolado', 'barra', '3', '12-15', '45s', 'Foco trapézio, sem rolar os ombros', false),
('Hiperextensão Lombar (Banco Romano)', 'costas', 'isolado', 'peso corporal', '3', '12-15', '45s', 'Foco lombar/eretores da espinha', false),
('Remada Invertida (Peso Corporal)', 'costas', 'composto', 'peso corporal', '4', '8-10', '90s', 'Barra fixa baixa, corpo inclinado', false),
('Desenvolvimento com Barra', 'ombro', 'composto', 'barra', '4', '8-10', '90s', 'Lombar apoiada', false),
('Desenvolvimento com Halteres', 'ombro', 'composto', 'halteres', '4', '8-10', '90s', 'Amplitude maior que a barra', false),
('Desenvolvimento Arnold', 'ombro', 'composto', 'halteres', '4', '8-10', '90s', 'Rotação completa do punho', false),
('Desenvolvimento na Máquina', 'ombro', 'composto', 'máquina', '4', '8-10', '90s', 'Trajetória guiada', false),
('Desenvolvimento Militar em Pé', 'ombro', 'composto', 'barra', '4', '8-10', '90s', 'Sem apoio lombar, core ativo', false),
('Elevação Lateral com Halteres', 'ombro', 'isolado', 'halteres', '3', '12-15', '45s', 'Leve inclinação do tronco', false),
('Elevação Lateral na Polia', 'ombro', 'isolado', 'polia', '3', '12-15', '45s', 'Tensão constante', false),
('Elevação Lateral na Máquina', 'ombro', 'isolado', 'máquina', '3', '12-15', '45s', 'Trajetória guiada', false),
('Elevação Frontal com Halteres', 'ombro', 'isolado', 'halteres', '3', '12-15', '45s', 'Foco deltoide anterior', false),
('Elevação Frontal com Barra', 'ombro', 'isolado', 'barra', '3', '12-15', '45s', 'Foco deltoide anterior', false),
('Crucifixo Invertido com Halteres', 'ombro', 'isolado', 'halteres', '3', '12-15', '45s', 'Foco deltoide posterior', false),
('Crucifixo Invertido na Máquina', 'ombro', 'isolado', 'máquina', '3', '12-15', '45s', 'Foco deltoide posterior', false),
('Face Pull', 'ombro', 'isolado', 'polia', '3', '12-15', '45s', 'Foco deltoide posterior e rotadores', false),
('Remada Alta com Barra', 'ombro', 'composto', 'barra', '4', '8-10', '90s', 'Cotovelos acima dos ombros', false),
('Manguito Rotador com Elástico', 'ombro', 'isolado', 'elástico', '3', '12-15', '45s', 'Rotação externa, carga leve', false),
('Push Press', 'ombro', 'composto', 'barra', '4', '8-10', '90s', 'Impulso das pernas ajuda a subida', false),
('Rosca Direta com Barra', 'biceps', 'isolado', 'barra', '3', '12-15', '45s', 'Sem balanço', false),
('Rosca Direta Barra W', 'biceps', 'isolado', 'barra', '3', '12-15', '45s', 'Menos estresse no punho', false),
('Rosca Alternada com Halteres', 'biceps', 'isolado', 'halteres', '3', '12-15', '45s', 'Supinação no topo', false),
('Rosca Martelo Alternada', 'biceps', 'isolado', 'halteres', '3', '12-15', '45s', 'Pegada neutra, foco braquial', false),
('Rosca Concentrada com Halter', 'biceps', 'isolado', 'halteres', '3', '12-15', '45s', 'Cotovelo apoiado, pico de contração', false),
('Rosca Scott', 'biceps', 'isolado', 'barra', '3', '12-15', '45s', 'Isola o bíceps, sem ajuda do ombro', false),
('Rosca no Cabo (Polia Baixa)', 'biceps', 'isolado', 'polia', '3', '12-15', '45s', 'Tensão constante', false),
('Rosca 21', 'biceps', 'isolado', 'barra', '3', '12-15', '45s', '7 parciais baixas + 7 altas + 7 completas', false),
('Rosca Inversa com Barra', 'biceps', 'isolado', 'barra', '3', '12-15', '45s', 'Foco antebraço', false),
('Rosca Spider', 'biceps', 'isolado', 'halteres', '3', '12-15', '45s', 'Banco inclinado, apoio no peito', false),
('Rosca Cross Body (Halteres)', 'biceps', 'isolado', 'halteres', '3', '12-15', '45s', 'Halter cruza em direção ao ombro oposto', false),
('Curl na Polia Alta (Bíceps)', 'biceps', 'isolado', 'polia', '3', '12-15', '45s', 'Ângulo de cima, foco pico do bíceps', false),
('Tríceps Testa com Barra W', 'triceps', 'isolado', 'barra', '3', '12-15', '45s', 'Cotovelos fixos', false),
('Tríceps Corda na Polia', 'triceps', 'isolado', 'polia', '3', '12-15', '45s', 'Full ROM, abre a corda no final', false),
('Tríceps Francês com Halter', 'triceps', 'isolado', 'halteres', '3', '12-15', '45s', 'Cotovelo estabilizado', false),
('Tríceps Coice com Halter', 'triceps', 'isolado', 'halteres', '3', '12-15', '45s', 'Tronco inclinado, cotovelo fixo', false),
('Mergulho no Banco (Tríceps)', 'triceps', 'composto', 'peso corporal', '4', '8-10', '90s', 'Cotovelos próximos ao corpo', false),
('Paralelas (Foco Tríceps)', 'triceps', 'composto', 'peso corporal', '4', '8-10', '90s', 'Tronco ereto', false),
('Tríceps Pulley Barra Reta', 'triceps', 'isolado', 'polia', '3', '12-15', '45s', 'Cotovelos colados ao corpo', false),
('Supino Fechado na Máquina', 'triceps', 'composto', 'máquina', '4', '8-10', '90s', 'Trajetória guiada, pegada fechada', false),
('Extensão de Tríceps Unilateral na Polia', 'triceps', 'isolado', 'polia', '3', '12-15', '45s', 'Um braço por vez', false),
('Tríceps Testa com Halteres', 'triceps', 'isolado', 'halteres', '3', '12-15', '45s', 'Cada braço controla o próprio halter', false),
('Kickback na Polia', 'triceps', 'isolado', 'polia', '3', '12-15', '45s', 'Tensão constante na extensão', false),
('Tríceps no Banco Declinado', 'triceps', 'isolado', 'barra', '3', '12-15', '45s', 'Alongamento extra na descida', false),
('Agachamento Livre', 'quadriceps', 'composto', 'barra', '4', '8-10', '90s', 'Profundo (paralelo)', false),
('Agachamento no Smith', 'quadriceps', 'composto', 'máquina', '4', '8-10', '90s', 'Trajetória guiada', false),
('Agachamento Frontal', 'quadriceps', 'composto', 'barra', '4', '8-10', '90s', 'Tronco mais ereto, foco quadríceps', false),
('Agachamento Sumô com Halter', 'quadriceps', 'composto', 'halteres', '4', '8-10', '90s', 'Pés afastados, foco adutores/quadríceps', false),
('Afundo Búlgaro', 'quadriceps', 'composto', 'halteres', '4', '8-10', '90s', 'Pé de trás elevado atrás', false),
('Leg Press 45°', 'quadriceps', 'composto', 'máquina', '4', '8-10', '90s', 'Amplitude máxima', false),
('Hack Squat na Máquina', 'quadriceps', 'composto', 'máquina', '4', '8-10', '90s', 'Trajetória guiada, foco quadríceps', false),
('Afundo Caminhando', 'quadriceps', 'composto', 'halteres', '4', '8-10', '90s', 'Passadas alternadas avançando', false),
('Afundo Estático', 'quadriceps', 'composto', 'halteres', '4', '8-10', '90s', 'Passada fixa, mais estável', false),
('Passada com Barra', 'quadriceps', 'composto', 'barra', '4', '8-10', '90s', 'Barra nas costas, passo à frente', false),
('Cadeira Extensora', 'quadriceps', 'isolado', 'máquina', '3', '12-15', '45s', 'Pausa 1s no topo', false),
('Cadeira Adutora', 'quadriceps', 'isolado', 'máquina', '3', '12-15', '45s', 'Carga moderada, foco adutores', false),
('Cadeira Abdutora', 'quadriceps', 'isolado', 'máquina', '3', '12-15', '45s', 'Foco glúteo médio/abdutores', false),
('Step-Up no Banco', 'quadriceps', 'composto', 'halteres', '4', '8-10', '90s', 'Sobe no banco alternando as pernas', false),
('Agachamento Isométrico na Parede', 'quadriceps', 'isolado', 'peso corporal', '3', '40s', '45s', 'Sustentação estática', false),
('Leg Press Unilateral', 'quadriceps', 'composto', 'máquina', '4', '8-10', '90s', 'Uma perna por vez', false),
('Agachamento com Kettlebell (Goblet)', 'quadriceps', 'composto', 'kettlebell', '4', '8-10', '90s', 'Kettlebell junto ao peito', false),
('Passada Lateral com Halter', 'quadriceps', 'composto', 'halteres', '4', '8-10', '90s', 'Foco adutores e quadríceps', false),
('Romeno com Barra', 'posterior_coxa', 'composto', 'barra', '4', '8-10', '90s', 'Joelhos levemente flexionados', false),
('Stiff com Halteres', 'posterior_coxa', 'composto', 'halteres', '4', '8-10', '90s', 'Carga menor, mais controle', false),
('Stiff com Barra', 'posterior_coxa', 'composto', 'barra', '4', '8-10', '90s', 'Estiramento máximo', false),
('Cadeira Flexora (Deitado)', 'posterior_coxa', 'isolado', 'máquina', '3', '12-15', '45s', 'Pausa no pico', false),
('Mesa Flexora (Sentado)', 'posterior_coxa', 'isolado', 'máquina', '3', '12-15', '45s', 'Negativa lenta', false),
('Flexora em Pé Unilateral', 'posterior_coxa', 'isolado', 'máquina', '3', '12-15', '45s', 'Uma perna por vez', false),
('Levantamento Terra Sumô', 'posterior_coxa', 'composto', 'barra', '4', '8-10', '90s', 'Pés afastados, pegada entre as pernas', false),
('Good Morning com Barra', 'posterior_coxa', 'composto', 'barra', '4', '8-10', '90s', 'Quadril dobra, joelhos quase travados', false),
('Flexora Nórdica (Nordic Curl)', 'posterior_coxa', 'composto', 'peso corporal', '4', '8-10', '90s', 'Excêntrica controlada, nível avançado', false),
('Cadeira Flexora Unilateral', 'posterior_coxa', 'isolado', 'máquina', '3', '12-15', '45s', 'Uma perna por vez, mais controle', false),
('Stiff com Kettlebell', 'posterior_coxa', 'composto', 'kettlebell', '4', '8-10', '90s', 'Kettlebell próximo ao corpo', false),
('Levantamento Terra com Halteres', 'posterior_coxa', 'composto', 'halteres', '4', '8-10', '90s', 'Halteres ao lado do corpo', false),
('Elevação Pélvica', 'gluteos', 'composto', 'barra', '4', '8-10', '90s', 'Pausa 2-3s no topo', false),
('Elevação Pélvica Unilateral', 'gluteos', 'composto', 'peso corporal', '4', '8-10', '90s', 'Uma perna por vez', false),
('Glúteo na Polia (Coice)', 'gluteos', 'isolado', 'polia', '3', '12-15', '45s', 'Contração de pico, sem impulso', false),
('Glúteo 4 Apoios com Caneleira', 'gluteos', 'isolado', 'caneleira', '3', '12-15', '45s', 'Quadril estável, sem rodar tronco', false),
('Abdução de Quadril na Máquina', 'gluteos', 'isolado', 'máquina', '3', '12-15', '45s', 'Foco glúteo médio', false),
('Ponte de Glúteo no Solo', 'gluteos', 'isolado', 'peso corporal', '3', '12-15', '45s', 'Pausa no topo', false),
('Passada com Foco Glúteo', 'gluteos', 'composto', 'halteres', '4', '8-10', '90s', 'Passo curto, empurra com o calcanhar', false),
('Agachamento Sumô com Kettlebell', 'gluteos', 'composto', 'kettlebell', '4', '8-10', '90s', 'Pés afastados, foco glúteo/adutores', false),
('Elevação Lateral de Perna Deitado', 'gluteos', 'isolado', 'peso corporal', '3', '12-15', '45s', 'Foco glúteo médio', false),
('Frog Pump (Elevação com Pés Unidos)', 'gluteos', 'isolado', 'peso corporal', '3', '12-15', '45s', 'Pés unidos, joelhos abertos', false),
('Coice na Máquina (Glúteo)', 'gluteos', 'isolado', 'máquina', '3', '12-15', '45s', 'Contração de pico', false),
('Step-Up com Foco Glúteo', 'gluteos', 'composto', 'halteres', '4', '8-10', '90s', 'Empurra com o calcanhar da perna de cima', false),
('Panturrilha em Pé', 'panturrilha', 'isolado', 'máquina', '3', '12-15', '45s', '2s de estiramento embaixo', false),
('Panturrilha Sentado', 'panturrilha', 'isolado', 'máquina', '3', '12-15', '45s', 'Amplitude completa, foco sóleo', false),
('Panturrilha no Leg Press', 'panturrilha', 'isolado', 'máquina', '3', '12-15', '45s', 'Ponta dos pés na plataforma', false),
('Panturrilha Unilateral com Halter', 'panturrilha', 'isolado', 'halteres', '3', '12-15', '45s', 'Uma perna por vez, apoio na parede', false),
('Panturrilha no Step (Peso Corporal)', 'panturrilha', 'isolado', 'peso corporal', '3', '12-15', '45s', 'Amplitude máxima na borda do step', false),
('Panturrilha Burrinho (Donkey Calf Raise)', 'panturrilha', 'isolado', 'máquina', '3', '12-15', '45s', 'Tronco inclinado à frente', false),
('Prancha Frontal Estática', 'core', 'isolado', 'peso corporal', '3', '40s', '30s', 'Isometria, corpo alinhado', true),
('Prancha Lateral Estática', 'core', 'isolado', 'peso corporal', '3', '30s cada lado', '30s', 'Estabilidade unilateral', true),
('Prancha com Elevação de Perna', 'core', 'isolado', 'peso corporal', '3', '40s', '30s', 'Isometria dinâmica', true),
('Abdominal Supra no Solo', 'core', 'isolado', 'peso corporal', '3', '15-20', '30s', 'Não puxa o pescoço', true),
('Abdominal Infra (Elevação de Pernas)', 'core', 'isolado', 'peso corporal', '3', '15-20', '30s', 'Lombar no chão', true),
('Abdominal na Polia (Corda)', 'core', 'isolado', 'polia', '3', '15-20', '30s', 'Pico de contração', true),
('Abdominal na Máquina', 'core', 'isolado', 'máquina', '3', '15-20', '30s', 'Carga controlada', true),
('Roda Abdominal (Ab Wheel)', 'core', 'isolado', 'peso corporal', '3', '10-12', '45s', 'Extensão total do core', true),
('Bicicleta no Solo', 'core', 'isolado', 'peso corporal', '3', '20 cada perna', '45s', 'Movimento alternado', true),
('Russian Twist com Halter', 'core', 'isolado', 'halteres', '3', '20 cada lado', '45s', 'Rotação de tronco', true),
('Elevação de Pernas Pendurado', 'core', 'isolado', 'peso corporal', '3', 'até a falha (máx 20)', '45s', 'Máximo alongamento', true),
('Crunch Invertido no Banco', 'core', 'isolado', 'peso corporal', '3', '15', '45s', 'Levanta o quadril', true),
('Prancha com Toque no Ombro', 'core', 'isolado', 'peso corporal', '3', '30s', '45s', 'Core anti-rotação', true),
('Dead Bug (Core Anti-Extensão)', 'core', 'isolado', 'peso corporal', '3', '12 cada lado', '45s', 'Lombar sempre no chão', true),
('Pallof Press na Polia', 'core', 'isolado', 'polia', '3', '12 cada lado', '45s', 'Core anti-rotação', true),
('Sit-Up com Peso', 'core', 'isolado', 'halteres', '3', '15-20', '30s', 'Amplitude completa', true),
('Esteira — Caminhada Inclinada', 'cardio', 'cardio', 'máquina', '-', '20min · Moderado', '-', '10% inclinação, ritmo moderado', true),
('Esteira — Corrida Moderada', 'cardio', 'cardio', 'máquina', '-', '20min · Moderado', '-', 'Ritmo confortável, dá pra conversar', true),
('Bicicleta Ergométrica', 'cardio', 'cardio', 'máquina', '-', '20min · Moderado', '-', 'Cadência constante', true),
('Elíptico', 'cardio', 'cardio', 'máquina', '-', '20min · Moderado', '-', 'Baixo impacto', true),
('Escada (StairMaster)', 'cardio', 'cardio', 'máquina', '-', '20min · Moderado', '-', 'Ritmo moderado, postura ereta', true),
('Corda Naval (Battle Rope)', 'cardio', 'cardio', 'peso corporal', '-', '10x30s', '30s', 'Ondulações alternadas', true),
('Pular Corda', 'cardio', 'cardio', 'peso corporal', '-', '15min', '-', 'Ritmo constante', true),
('Remo Ergométrico', 'cardio', 'cardio', 'máquina', '-', '20min · Moderado', '-', 'Empurra com as pernas primeiro', true),
('HIIT na Esteira (Sprints)', 'cardio', 'cardio', 'máquina', '-', '15min', '-', '1min forte / 2min caminhada', true),
('Bike Spinning', 'cardio', 'cardio', 'máquina', '-', '20min · Moderado', '-', 'Alterna ritmo e resistência', true),
('Caminhada ao Ar Livre', 'cardio', 'cardio', 'peso corporal', '-', '30-40min', '-', '5-6km/h', true),
('Circuito Funcional (Cardio)', 'cardio', 'cardio', 'peso corporal', '-', '15min', '-', 'Estações alternadas sem pausa', true)
on conflict (nome) do nothing;

-- Levantamentos livres com demanda técnica/articular maior: a partir do
-- intermediário. Os que já têm variante guiada em LEVEL_EXERCISE_SUBS (ex.:
-- Supino Reto com Barra → Supino Reto na Máquina) continuam fora do sorteio do
-- iniciante — a variante guiada já está na biblioteca como exercício próprio.
update public.exercise_library set nivel_minimo = 'intermediario' where nome in (
  'Supino Reto com Barra', 'Supino Inclinado com Barra', 'Supino Declinado com Barra',
  'Supino Fechado com Barra', 'Paralelas (Peito)', 'Paralelas (Foco Tríceps)',
  'Levantamento Terra', 'Remada Curvada com Barra', 'Remada com Barra T',
  'Barra Fixa (peso corporal)',
  'Desenvolvimento com Barra', 'Desenvolvimento Arnold', 'Remada Alta com Barra',
  'Agachamento Livre', 'Afundo Búlgaro', 'Passada com Barra',
  'Romeno com Barra', 'Stiff com Barra', 'Levantamento Terra com Halteres'
);

-- Exigem base técnica sólida (carga axial alta com alavanca longa, explosão
-- ou excêntrica pesada): só no avançado.
update public.exercise_library set nivel_minimo = 'avancado' where nome in (
  'Desenvolvimento Militar em Pé', 'Push Press', 'Agachamento Frontal',
  'Good Morning com Barra', 'Levantamento Terra Sumô', 'Flexora Nórdica (Nordic Curl)'
);

create index if not exists exercise_library_nivel_idx on public.exercise_library (nivel_minimo);
