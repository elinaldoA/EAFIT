import { db } from './supabase';
import { trackFeature } from './tracking';
import { todayDate } from '../data/treinoData';

export function proteinStorageKey() {
  return `proteina_${todayDate()}`;
}

export async function fetchProteinLog(userId, date) {
  const { data, error } = await db
    .from('protein_logs')
    .select('amount_g')
    .eq('user_id', userId)
    .eq('log_date', date)
    .maybeSingle();
  if (error) throw error;
  return data?.amount_g ?? null;
}

export async function upsertProteinLog(userId, date, amountG) {
  trackFeature('protein');
  const { error } = await db
    .from('protein_logs')
    .upsert(
      { user_id: userId, log_date: date, amount_g: amountG },
      { onConflict: 'user_id,log_date' }
    );
  if (error) throw error;
}

export async function fetchProteinLogsRange(userId, sinceDate) {
  const { data, error } = await db
    .from('protein_logs')
    .select('log_date, amount_g')
    .eq('user_id', userId)
    .gte('log_date', sinceDate)
    .order('log_date', { ascending: true });
  if (error) throw error;
  return data || [];
}
