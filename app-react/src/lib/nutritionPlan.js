import { db } from './supabase';
import { enqueue, queueSize } from './syncQueue';
import { cleanMeals } from './dietImport';

// Dieta importada: um plano por usuário (lista de refeições com os itens).
// Cópia no aparelho para abrir sem rede; escrita que falha vai para a fila.
const cacheKey = userId => `nutritionPlan_${userId}`;

export function readCachedPlan(userId) {
  try {
    const v = JSON.parse(localStorage.getItem(cacheKey(userId)));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeCache(userId, meals) {
  try { localStorage.setItem(cacheKey(userId), JSON.stringify(meals)); } catch { /* sem cache */ }
}

// Com escrita pendente na fila, vale o que está no aparelho: o servidor ainda não tem.
export async function fetchPlan(userId) {
  const { data, error } = await db.from('nutrition_plans').select('meals').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (queueSize() > 0) return readCachedPlan(userId);
  const meals = Array.isArray(data?.meals) ? data.meals : [];
  writeCache(userId, meals);
  return meals;
}

// Lista vazia apaga o plano. Idempotente: repetir pela fila dá o mesmo resultado.
export async function writePlanRow(userId, meals) {
  if (!meals.length) {
    const { error } = await db.from('nutrition_plans').delete().eq('user_id', userId);
    if (error) throw error;
    return;
  }
  const { error } = await db.from('nutrition_plans').upsert({ user_id: userId, meals, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}

export async function savePlan(userId, meals) {
  const clean = cleanMeals(meals);
  writeCache(userId, clean);
  try {
    await writePlanRow(userId, clean);
  } catch (err) {
    console.error('savePlan:', err);
    enqueue('plan_save', { userId, meals: clean });
  }
  return clean;
}
