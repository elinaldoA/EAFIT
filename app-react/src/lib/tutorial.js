// Tutorial guiado do app: passos do aluno e do personal + controle de "já viu".
// Cada passo pode levar a uma aba (`tab`) e destacar um elemento (`target`, um
// seletor CSS). Se o elemento não existir na tela, o passo aparece centralizado.
const DONE_KEY = 'eafit_tutorial_done';
export const TUTORIAL_EVENT = 'eafit:tutorial';

const nav = n => `.bottom-nav .nav-item:nth-child(${n})`;

export const STUDENT_STEPS = [
  {
    icon: '👋', title: 'Bem-vindo ao EAFIT',
    text: 'Em poucos passos você conhece tudo o que o app faz. Dá pra pular a qualquer momento e rever depois em Perfil → Ajuda.',
  },
  {
    tab: 'treino', target: '#page-treino .progress-card', icon: '🏋️', title: 'Seu treino da semana',
    text: 'Aqui ficam o card "Treino de hoje" e a semana atual. Cada dia abre com os exercícios, séries, repetições e descanso. Marque as séries concluídas e anote a carga usada.',
  },
  {
    tab: 'treino', icon: '⚡', title: 'Modo treino ao vivo',
    text: 'Toque em "Treino de hoje" (ou no ⚡ de um dia) para treinar em tela cheia: um exercício por vez, descanso com cronômetro e a tela sempre acesa. Use "▶ Ver execução" para ver como fazer o movimento.',
  },
  {
    tab: 'treino', target: '#page-treino .toolbar', icon: '⚙️', title: 'Ajuste o treino',
    text: 'Em "Editar treino" você troca exercícios, muda séries e escolhe outro plano. "Limpar" zera os checks e cargas da semana.',
  },
  {
    tab: 'historico', target: nav(2), icon: '📅', title: 'Histórico',
    text: 'O calendário mostra os dias treinados. Toque num dia para ver a sessão e comparar cada exercício com a última vez que você o fez.',
  },
  {
    tab: 'hidratacao', target: nav(3), icon: '💧', title: 'Hidratação',
    text: 'A meta de água é calculada pelo seu peso. Registre copo, caneca, garrafa ou squeeze com um toque (dá pra desfazer) e acompanhe sua sequência de dias na meta.',
  },
  {
    tab: 'dash', target: nav(4), icon: '📈', title: 'Evolução',
    text: 'Gráficos de carga e volume, recordes pessoais, conquistas, avatar dos músculos trabalhados, evolução do peso e fotos de progresso — nas abas Treinos, Recordes e Corpo.',
  },
  {
    tab: 'perfil', target: nav(5), icon: '👤', title: 'Perfil e metas',
    text: 'Atualize peso e altura, defina metas semanais de treino e de água, ative lembretes, pause o plano quando precisar e exporte seus dados (CSV, backup ou relatório).',
  },
  {
    tab: 'perfil', icon: '🤝', title: 'Tem personal?',
    text: 'Em Perfil → "Meu personal", digite o código que ele te passou. Ele passa a montar seu treino e acompanhar sua evolução; os recados dele aparecem no Perfil e no topo do Treino.',
  },
  {
    tab: 'treino', icon: '🚀', title: 'Tudo pronto!',
    text: 'Agora é só treinar. Instale o app na tela inicial para abrir rápido e usar sem internet. Para rever este guia: Perfil → Ajuda.',
  },
];

export const TRAINER_STEPS = [
  {
    icon: '🧑‍🏫', title: 'Bem-vindo, Personal',
    text: 'Este é o seu painel: acompanhe alunos, monte treinos, crie desafios e mande recados. Dá pra pular e rever depois em Conta → Ajuda.',
  },
  {
    tab: 'alunos', target: nav(1), icon: '👥', title: 'Seus alunos',
    text: 'Toque em "Convidar aluno" para compartilhar seu código. Quando o aluno o digita em Perfil → Meu personal, ele aparece aqui. Os filtros destacam quem precisa de atenção (sem treinar, plano vencendo).',
  },
  {
    tab: 'alunos', icon: '📋', title: 'Ficha do aluno',
    text: 'Abra um aluno para ver frequência, sequência, medidas, como ele tem se sentido, desconfortos e cargas máximas. Dali você monta o plano, conversa com ele e registra anotações, fotos, aulas e metas.',
  },
  {
    tab: 'modelos', target: nav(2), icon: '🧩', title: 'Modelos de treino',
    text: 'Crie um modelo uma vez ("+ Novo modelo") e envie para vários alunos de uma só vez. "Editar como novo" ajusta uma cópia sem mexer no original.',
  },
  {
    tab: 'turma', target: nav(3), icon: '🏆', title: 'Turma e desafios',
    text: 'Crie desafios com nome e prazo para toda a turma ou só para alguns alunos. Os participantes são avisados e você acompanha o andamento.',
  },
  {
    tab: 'recados', target: nav(4), icon: '💬', title: 'Recados',
    text: 'Envie incentivos e orientações para todos ou para alunos escolhidos. Eles recebem uma notificação e você vê o histórico dos enviados.',
  },
  {
    tab: 'conta', target: nav(5), icon: '⚙️', title: 'Conta e alertas',
    text: 'Ative as notificações para saber quando um aluno precisar de você e escolha quais alertas receber. Quer treinar também? "Usar como aluno" troca para o app de treino.',
  },
  {
    tab: 'alunos', icon: '🚀', title: 'Tudo pronto!',
    text: 'Comece convidando seu primeiro aluno. Para rever este guia: Conta → Ajuda.',
  },
];

export function stepsFor(role) {
  return role === 'trainer' ? TRAINER_STEPS : STUDENT_STEPS;
}

function key(role, userId) {
  return `${DONE_KEY}:${role}:${userId}`;
}

export function hasSeenTutorial(role, userId) {
  try { return localStorage.getItem(key(role, userId)) === '1'; } catch { return true; }
}

export function markTutorialSeen(role, userId) {
  try { localStorage.setItem(key(role, userId), '1'); } catch { /* sem storage */ }
}

// Chamado pelos botões "Ver tutorial" (Perfil e Conta do personal).
export function startTutorial() {
  window.dispatchEvent(new CustomEvent(TUTORIAL_EVENT));
}
