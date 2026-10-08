// Convite pra usar a função Amigos, mostrado no resumo do treino. Hoje só quem
// abre Dashboard → Amigos descobre o recurso.
const DISMISSED_KEY = 'eafit_friends_prompt_dismissed_at';
export const REOFFER_AFTER_DAYS = 30;

// Dispensado há pouco: nem vale consultar os amigos no servidor.
export function recentlyDismissed(dismissedAt, now = Date.now()) {
  return !!dismissedAt && now - dismissedAt < REOFFER_AFTER_DAYS * 86400000;
}

// Pura (testável): oferece com a função ligada no painel admin, a quem ainda
// não tem amigo nem pedido (enviado ou recebido) e não dispensou o convite nos
// últimos REOFFER_AFTER_DAYS dias.
export function shouldOfferFriends({ flagOn, friendCount, dismissedAt, now = Date.now() }) {
  return !!flagOn && friendCount === 0 && !recentlyDismissed(dismissedAt, now);
}

export function readFriendsPromptDismissedAt() {
  try {
    const v = Number(localStorage.getItem(DISMISSED_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function markFriendsPromptDismissed(now = Date.now()) {
  try { localStorage.setItem(DISMISSED_KEY, String(now)); } catch { /* armazenamento bloqueado */ }
}
