// "Está gostando do EAFIT?" — pedido de avaliação do app, feito ao fechar o
// resumo de um treino (a pessoa acabou de ver valor no app). O EAFIT é um PWA,
// sem loja: a nota vai pra fila de Feedback do painel admin.
const KEY = 'eafit_app_rating';
export const MIN_WORKOUTS = 3;
export const REASK_AFTER_DAYS = 30;
export const COMMENT_MAX = 500;

// Pura (testável): pergunta a partir do MIN_WORKOUTS-ésimo treino concluído
// neste aparelho, nunca mais depois de avaliar, e só volta a perguntar
// REASK_AFTER_DAYS dias depois de um "Agora não".
export function shouldAskAppRating({ workouts, answeredAt, dismissedAt, now = Date.now() }) {
  if (answeredAt) return false;
  if ((workouts || 0) < MIN_WORKOUTS) return false;
  if (dismissedAt && now - dismissedAt < REASK_AFTER_DAYS * 86400000) return false;
  return true;
}

export function readAppRatingState() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object') return saved;
  } catch { /* sem armazenamento ou valor inválido */ }
  return {};
}

function saveState(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* armazenamento bloqueado */ }
}

// Conta mais um treino concluído e diz se é hora de perguntar.
export function noteWorkoutFinished(now = Date.now()) {
  const state = readAppRatingState();
  const next = { ...state, workouts: (Number(state.workouts) || 0) + 1 };
  saveState(next);
  return shouldAskAppRating({ ...next, now });
}

export function markAppRatingDismissed(now = Date.now()) {
  saveState({ ...readAppRatingState(), dismissedAt: now });
}

export function markAppRatingAnswered(now = Date.now()) {
  saveState({ ...readAppRatingState(), answeredAt: now });
}

// Nota + comentário no formato da tabela feedback. O texto fica em português
// (é o admin quem lê): 4–5 estrelas entram como elogio, o resto como sugestão.
export function buildRatingFeedback(stars, comment) {
  const text = String(comment || '').trim().slice(0, COMMENT_MAX);
  return {
    kind: stars >= 4 ? 'elogio' : 'sugestao',
    message: `Avaliação do app: ⭐ ${stars}/5${text ? `\n${text}` : ''}`,
  };
}
