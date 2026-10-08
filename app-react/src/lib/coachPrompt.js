// Convite pra ligar o treinador por voz, mostrado dentro do modo treino — é
// onde ele fala. Hoje só quem acha Perfil → Treinador por voz liga o recurso.
const DISMISSED_KEY = 'eafit_coach_prompt_dismissed_at';
export const REOFFER_AFTER_DAYS = 30;

// Pura (testável): oferece quando o aparelho fala português, a voz está
// desligada, a pessoa nunca mexeu nessa opção no Perfil (`decided`: quem
// desligou de propósito não é incomodado) e o convite não foi dispensado nos
// últimos REOFFER_AFTER_DAYS dias.
export function shouldOfferCoach({ available, enabled, decided, dismissedAt, now = Date.now() }) {
  if (!available || enabled || decided) return false;
  if (dismissedAt && now - dismissedAt < REOFFER_AFTER_DAYS * 86400000) return false;
  return true;
}

export function readCoachPromptDismissedAt() {
  try {
    const v = Number(localStorage.getItem(DISMISSED_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function markCoachPromptDismissed(now = Date.now()) {
  try { localStorage.setItem(DISMISSED_KEY, String(now)); } catch { /* armazenamento bloqueado */ }
}
