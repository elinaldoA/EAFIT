import { db } from './supabase';
import { enqueue, queueSize } from './syncQueue';

// Diário por refeição: o detalhe de cada alimento do dia. Os totais continuam
// em protein_logs (nutritionTotals/proteinLog); a tela mantém os dois juntos.
export const MEALS = ['cafe', 'almoco', 'lanche', 'jantar', 'outro'];

export function mealForHour(hour) {
  if (hour < 10) return 'cafe';
  if (hour < 14) return 'almoco';
  if (hour < 18) return 'lanche';
  return 'jantar';
}

const COLS = 'id, log_date, meal, name, icon, protein_g, kcal, carbs_g, fat_g';
const cacheKey = date => `nutricaoEntries_${date}`;

export function entryFromRow(r) {
  return {
    id: r.id,
    meal: MEALS.includes(r.meal) ? r.meal : 'outro',
    label: r.name,
    icon: r.icon || '🍽️',
    g: r.protein_g || 0,
    kcal: r.kcal || 0,
    carbs: r.carbs_g || 0,
    fat: r.fat_g || 0,
  };
}

function rowFromEntry(userId, date, e) {
  return {
    id: e.id, user_id: userId, log_date: date, meal: e.meal, name: ((e.label || '').trim() || 'Alimento').slice(0, 60), icon: e.icon || '🍽️',
    protein_g: e.g || 0, kcal: e.kcal || 0, carbs_g: e.carbs || 0, fat_g: e.fat || 0,
  };
}

export function readCachedEntries(date) {
  try {
    return JSON.parse(localStorage.getItem(cacheKey(date))) || [];
  } catch {
    return [];
  }
}

function writeCache(date, list) {
  try { localStorage.setItem(cacheKey(date), JSON.stringify(list)); } catch { /* sem cache */ }
}

// Só troca o que está no aparelho pelo servidor quando não há nada pendente na
// fila: um registro feito sem rede ainda não está lá, e sumiria da lista.
export async function fetchEntries(userId, date) {
  const { data, error } = await db
    .from('nutrition_entries')
    .select(COLS)
    .eq('user_id', userId)
    .eq('log_date', date)
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (queueSize() > 0) return readCachedEntries(date);
  const list = (data || []).map(entryFromRow);
  writeCache(date, list);
  return list;
}

export async function fetchEntriesRange(userId, sinceDate) {
  const { data, error } = await db
    .from('nutrition_entries')
    .select(COLS)
    .eq('user_id', userId)
    .gte('log_date', sinceDate)
    .order('log_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function saveEntryRow(row) {
  const { error } = await db.from('nutrition_entries').upsert(row, { onConflict: 'id' });
  if (error) throw error;
}

export async function deleteEntryRow(userId, id) {
  const { error } = await db.from('nutrition_entries').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

async function saveOrQueue(userId, date, entry) {
  const row = rowFromEntry(userId, date, entry);
  try {
    await saveEntryRow(row);
  } catch (err) {
    console.error('saveEntry:', err);
    enqueue('entry_save', { userId, row });
  }
}

// Todas devolvem a lista nova do dia e atualizam o aparelho antes da rede.
export async function addEntry(userId, date, food, meal, id = crypto.randomUUID()) {
  const entry = { ...food, id, meal };
  const list = [...readCachedEntries(date), entry];
  writeCache(date, list);
  await saveOrQueue(userId, date, entry);
  return list;
}

export async function updateEntry(userId, date, id, patch) {
  const list = readCachedEntries(date).map(e => (e.id === id ? { ...e, ...patch, id } : e));
  writeCache(date, list);
  const entry = list.find(e => e.id === id);
  if (entry) await saveOrQueue(userId, date, entry);
  return list;
}

export async function removeEntry(userId, date, id) {
  const list = readCachedEntries(date).filter(e => e.id !== id);
  writeCache(date, list);
  try {
    await deleteEntryRow(userId, id);
  } catch (err) {
    console.error('removeEntry:', err);
    enqueue('entry_delete', { userId, id });
  }
  return list;
}
