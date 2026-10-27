import { db } from './supabase';
import { foodFromRow } from './foodShortcuts';

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

export async function createCustomFood(userId, { name, g, kcal, carbs, fat }) {
  const { error } = await db
    .from('nutrition_foods')
    .insert({ user_id: userId, name: name.trim(), protein_g: g, kcal, carbs_g: carbs, fat_g: fat });
  if (error) throw error;
  return fetchCustomFoods(userId);
}

export async function deleteCustomFood(userId, id) {
  const { error } = await db.from('nutrition_foods').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
  return fetchCustomFoods(userId);
}
