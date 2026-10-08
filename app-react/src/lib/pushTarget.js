// Que tela cada notificação abre. Usado pelo service worker (sw.js) no toque
// da notificação e pela central de avisos (lib/inbox.js) — por isso este
// arquivo não importa nada do app: precisa rodar dentro do service worker.
//
// O push não diz pra onde vai; o que identifica o assunto é a `tag` que cada
// Edge Function já manda (supabase/functions/*) e, nos lembretes automáticos,
// o tipo da regra (engagement_rules.kind). Tipo novo de push: acrescente aqui.

// Título que o painel admin usa ao responder um feedback
// (app-admin/src/lib/feedback.js). Esse aviso chega sem tag e com kind
// 'aviso', igual a qualquer comunicado: só o título o distingue.
export const FEEDBACK_REPLY_TITLE = '💬 Resposta ao seu feedback';

// Lembretes automáticos (engagement_rules) que falam do treino.
const WORKOUT_KINDS = [
  'plan_expiring', 'first_workout', 'first_workout_late', 'no_plan', 'second_workout',
  'weekly_goal', 'workout_today', 'comeback',
];

// Destinos: aba (hash), modo do app (quem é personal usa os dois) e o que a
// tela deve abrir — aba do Dashboard ou cartão do Perfil.
export const NAV_TARGETS = {
  treino: { mode: 'aluno', tab: 'treino' },
  agua: { mode: 'aluno', tab: 'hidratacao' },
  semana: { mode: 'aluno', tab: 'dash', dashTab: 'treinos' },
  recordes: { mode: 'aluno', tab: 'dash', dashTab: 'recordes' },
  amigos: { mode: 'aluno', tab: 'dash', dashTab: 'amigos' },
  peso: { mode: 'aluno', tab: 'perfil', profileCard: 'corpo' },
  feedback: { mode: 'aluno', tab: 'perfil', profileCard: 'feedback' },
  // Lembrete de aula vai pro aluno e pro personal: mantém o modo em que a
  // pessoa está. No modo Personal 'treino' não é aba e cai em Alunos, onde
  // fica a agenda.
  aula: { tab: 'treino' },
  personal_alunos: { mode: 'trainer', tab: 'alunos' },
  personal_recados: { mode: 'trainer', tab: 'recados' },
};

// Tipo de lembrete automático -> chave de destino (ou null).
export function kindTargetKey(kind) {
  if (kind === 'invite_friends') return 'amigos';
  return WORKOUT_KINDS.includes(kind) ? 'treino' : null;
}

const TAG_RULES = [
  [/^water-/, 'agua'],
  [/^(streak-risk|inactivity)-/, 'treino'],
  [/^weekly-summary-/, 'semana'],
  [/^weight-update-/, 'peso'],
  [/^(discomfort-followup|pr|badge)-/, 'recordes'], // dores, recordes e conquistas ficam em Dashboard → Recordes
  [/^appt-response-/, 'personal_alunos'],
  [/^appt-/, 'aula'],
  [/^trainer-reply-/, 'personal_recados'],
  [/^trainer-message$/, 'treino'], // o recado novo aparece no topo da tela de Treino
  [/^trainer-(alerts|weekly)-/, 'personal_alunos'],
];
const ENGAGEMENT_TAG = /^engagement-(.+)-\d{4}-\d{2}-\d{2}$/;

// Chave de destino de uma notificação, pela tag (ou pelo título, na resposta
// de feedback). null = comunicado sem tela própria: só abre o app.
export function pushTargetKey({ tag, title } = {}) {
  const value = typeof tag === 'string' ? tag : '';
  const engagement = value.match(ENGAGEMENT_TAG);
  if (engagement) return kindTargetKey(engagement[1]);
  const rule = TAG_RULES.find(([re]) => re.test(value));
  if (rule) return rule[1];
  return title === FEEDBACK_REPLY_TITLE ? 'feedback' : null;
}
