import { db } from './supabase';
import { trackFeature } from './tracking';
import { todayDate } from '../data/treinoData';
import { normalizeTotals } from './nutritionTotals';

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

// Totais do dia (proteína, kcal, carboidratos, gorduras) num único JSON local.
// Sem ele, cai na chave antiga só de proteína (registros de antes dos macros).
export function nutritionStorageKey() {
  return `nutricao_${todayDate()}`;
}

export function readLocalTotals() {
  try {
    const raw = JSON.parse(localStorage.getItem(nutritionStorageKey()));
    if (raw) return normalizeTotals(raw);
  } catch { /* JSON inválido: usa a chave antiga */ }
  return normalizeTotals({ protein: parseInt(localStorage.getItem(proteinStorageKey()), 10) });
}

export function writeLocalTotals(totals) {
  localStorage.setItem(nutritionStorageKey(), JSON.stringify(totals));
  localStorage.setItem(proteinStorageKey(), totals.protein);
}

export async function fetchNutritionLog(userId, date) {
  const { data, error } = await db
    .from('protein_logs')
    .select('amount_g, kcal, carbs_g, fat_g')
    .eq('user_id', userId)
    .eq('log_date', date)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return normalizeTotals({ protein: data.amount_g, kcal: data.kcal, carbs: data.carbs_g, fat: data.fat_g });
}

export async function upsertNutritionLog(userId, date, totals) {
  trackFeature('protein');
  const { error } = await db
    .from('protein_logs')
    .upsert(
      { user_id: userId, log_date: date, amount_g: totals.protein, kcal: totals.kcal, carbs_g: totals.carbs, fat_g: totals.fat },
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
