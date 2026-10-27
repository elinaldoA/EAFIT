import { db } from './supabase';
import { foodFromRow } from './foodShortcuts';
import { enqueue } from './syncQueue';

const COLS = 'id, name, icon, protein_g, kcal, carbs_g, fat_g';

// Cópia local para mostrar os atalhos sem rede.
const cacheKey = userId => `customFoods_${userId}`;

export function readCachedFoods(userId) {
  try {
    return (JSON.parse(localStorage.getItem(cacheKey(userId))) || []).map(foodFromRow);
  } catch {
    return [];
  }
}

function readCachedRows(userId) {
  try {
    return JSON.parse(localStorage.getItem(cacheKey(userId))) || [];
  } catch {
    return [];
  }
}

function writeCache(userId, rows) {
  try { localStorage.setItem(cacheKey(userId), JSON.stringify(rows)); } catch { /* sem cache */ }
}

export async function fetchCustomFoods(userId) {
  const { data, error } = await db
    .from('nutrition_foods')
    .select(COLS)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  writeCache(userId, data || []);
  return (data || []).map(foodFromRow);
}

function rowFromFood(userId, id, { name, g, kcal, carbs, fat }) {
  return { id, user_id: userId, name: name.trim(), protein_g: g, kcal, carbs_g: carbs, fat_g: fat };
}

// Grava (insere ou atualiza) pelo id. O id nasce no aparelho, então repetir a
// operação (fila offline) não duplica o atalho.
export async function saveCustomFoodRow(row) {
  const { error } = await db.from('nutrition_foods').upsert(row, { onConflict: 'id' });
  if (error) throw error;
}

export async function deleteCustomFoodRow(userId, id) {
  const { error } = await db.from('nutrition_foods').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

// Os três abaixo atualizam o cache na hora e devolvem a lista; se o servidor
// falhar (sem rede), a operação vai para a fila de sincronização.
async function saveOrQueue(userId, row, nextRows) {
  writeCache(userId, nextRows);
  try {
    await saveCustomFoodRow(row);
  } catch (err) {
    console.error('saveCustomFood:', err);
    enqueue('food_save', { userId, row });
  }
  return nextRows.map(foodFromRow);
}

export async function createCustomFood(userId, food) {
  const row = rowFromFood(userId, crypto.randomUUID(), food);
  return saveOrQueue(userId, row, [...readCachedRows(userId), row]);
}

export async function updateCustomFood(userId, id, food) {
  const row = rowFromFood(userId, id, food);
  const prev = readCachedRows(userId);
  return saveOrQueue(userId, row, prev.map(r => (r.id === id ? { ...r, ...row } : r)));
}

export async function deleteCustomFood(userId, id) {
  const next = readCachedRows(userId).filter(r => r.id !== id);
  writeCache(userId, next);
  try {
    await deleteCustomFoodRow(userId, id);
  } catch (err) {
    console.error('deleteCustomFood:', err);
    enqueue('food_delete', { userId, id });
  }
  return next.map(foodFromRow);
}
