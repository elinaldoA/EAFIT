import { db } from './supabase';
import { trackFeature } from './tracking';
import { enqueue } from './syncQueue';
import { todayDate, waterStorageKey } from '../data/treinoData';

export async function fetchWaterLog(userId, date) {
  const { data, error } = await db
    .from('water_logs')
    .select('amount_ml')
    .eq('user_id', userId)
    .eq('log_date', date)
    .maybeSingle();
  if (error) throw error;
  return data?.amount_ml ?? null;
}

export async function upsertWaterLog(userId, date, amountMl) {
  trackFeature('water');
  const { error } = await db
    .from('water_logs')
    .upsert(
      { user_id: userId, log_date: date, amount_ml: amountMl },
      { onConflict: 'user_id,log_date' }
    );
  if (error) throw error;
}

export async function fetchWaterLogsRange(userId, sinceDate) {
  const { data, error } = await db
    .from('water_logs')
    .select('log_date, amount_ml')
    .eq('user_id', userId)
    .gte('log_date', sinceDate)
    .order('log_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Soma no consumo de água do dia (o mesmo da página Hidratação), usado pelo
// lembrete do modo treino. Sem rede, vai
// para a fila de sincronização. Devolve o total do dia em ml.
export function addWaterMl(user, ml, onQueued) {
  const total = (parseInt(localStorage.getItem(waterStorageKey()), 10) || 0) + ml;
  localStorage.setItem(waterStorageKey(), total);
  if (user) {
    const date = todayDate();
    upsertWaterLog(user.id, date, total).catch(err => {
      console.error('upsertWaterLog:', err);
      enqueue('water_log', { userId: user.id, date, amountMl: total });
      onQueued?.();
    });
  }
  return total;
}
