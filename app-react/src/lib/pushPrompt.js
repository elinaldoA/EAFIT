// Convite pra ativar lembretes (push) logo depois de concluir um treino — o
// melhor momento: a pessoa acabou de ver valor no app. Hoje só quem entra em
// Perfil → Notificações liga o push, e quem não liga nunca recebe nada.
const DISMISSED_KEY = 'eafit_push_prompt_dismissed_at';
export const REOFFER_AFTER_DAYS = 14;

// Pura (testável): oferece quando o navegador suporta, a permissão ainda não
// foi decidida (nem concedida nem negada), os lembretes estão desligados e o
// convite não foi dispensado nos últimos REOFFER_AFTER_DAYS dias.
export function shouldOfferPush({
  notificationsSupported, pushSupported, permission, remindersEnabled, dismissedAt, now = Date.now(),
}) {
  if (!notificationsSupported || !pushSupported) return false;
  if (permission !== 'default') return false;
  if (remindersEnabled) return false;
  if (dismissedAt && now - dismissedAt < REOFFER_AFTER_DAYS * 86400000) return false;
  return true;
}

export function readDismissedAt() {
  try {
    const v = Number(localStorage.getItem(DISMISSED_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function markPushPromptDismissed(now = Date.now()) {
  try { localStorage.setItem(DISMISSED_KEY, String(now)); } catch { /* armazenamento bloqueado */ }
}
