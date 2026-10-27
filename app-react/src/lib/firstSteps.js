import { db } from './supabase';
import { isNotificationSupported } from './notifications';

// Cartão "Primeiros passos" da aba Treino: ajuda quem acabou de criar a conta
// a ver valor nos primeiros dias (treinar, água, comida, lembretes). Some
// sozinho ao completar tudo, ao passar da janela ou se a pessoa dispensar.
export const FIRST_STEPS_DAYS = 14;
const DISMISS_KEY = 'eafit_first_steps_dismissed';
const DAY_MS = 86400000;

export const STEP_KEYS = ['workout', 'water', 'food', 'reminders'];

export function isNewAccount(user, now = Date.now()) {
  const created = Date.parse(user?.created_at || '');
  return Number.isFinite(created) && now - created < FIRST_STEPS_DAYS * DAY_MS;
}

export function isFirstStepsDismissed(userId) {
  try { return localStorage.getItem(`${DISMISS_KEY}_${userId}`) === '1'; } catch { return false; }
}

export function dismissFirstSteps(userId) {
  try { localStorage.setItem(`${DISMISS_KEY}_${userId}`, '1'); } catch { /* sem storage: volta na próxima */ }
}

async function hasRow(table, userId) {
  const { data, error } = await db.from(table).select('user_id').eq('user_id', userId).limit(1);
  if (error) throw error;
  return (data?.length || 0) > 0;
}

// { workout, water, food, reminders } — true quando o passo já foi dado.
// Falha de rede em um passo conta como "não feito" (só mostra o convite).
export async function fetchFirstSteps(userId) {
  const safe = p => p.catch(() => false);
  const [workout, water, food] = await Promise.all([
    safe(hasRow('workouts', userId)),
    safe(hasRow('water_logs', userId)),
    safe(hasRow('protein_logs', userId)),
  ]);
  const reminders = isNotificationSupported() && Notification.permission === 'granted';
  return { workout, water, food, reminders };
}

export function countDone(steps) {
  return STEP_KEYS.filter(k => steps?.[k]).length;
}
