// Sessão do painel por inatividade. O painel mostra dados de usuários e pedidos
// de LGPD; um computador deixado aberto não pode ficar logado para sempre.
// Usa horários (Date.now) e não um temporizador único: se o notebook dormir,
// ao acordar a conta já expirou. O último movimento fica no localStorage para
// valer entre abas (mexer numa aba mantém as outras vivas).
export const IDLE_MS = 30 * 60 * 1000;
export const WARN_MS = 60 * 1000;
export const ACTIVITY_KEY = 'eafit-admin-last-activity';

export function readLastActivity(fallback = Date.now()) {
  try {
    const v = Number(localStorage.getItem(ACTIVITY_KEY));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  } catch { return fallback; }
}

export function writeLastActivity(at = Date.now()) {
  try { localStorage.setItem(ACTIVITY_KEY, String(at)); } catch { /* sem storage: vale só nesta aba */ }
}

// 'active' | 'warning' | 'expired', mais os segundos que faltam.
export function idleState(lastActivity, now = Date.now(), idleMs = IDLE_MS, warnMs = WARN_MS) {
  const left = lastActivity + idleMs - now;
  if (left <= 0) return { status: 'expired', secondsLeft: 0 };
  if (left <= warnMs) return { status: 'warning', secondsLeft: Math.ceil(left / 1000) };
  return { status: 'active', secondsLeft: Math.ceil(left / 1000) };
}
