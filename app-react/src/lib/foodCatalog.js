import { db } from './supabase';

// Catálogo de alimentos do painel (tabela food_catalog), com os desativados (que
// escondem o item de mesmo nome da lista do app); a cópia
// local deixa a busca completa sem rede. Sem a tabela ou sem rede, a busca segue
// só com a lista do app e a TACO.
const KEY = 'foodCatalog_v1';
const COLS = 'id, name, name_en, active, icon, category, portion_g, kcal, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, sugar_g, sat_fat_g, estimated, measures';

export function readCachedCatalog() {
  try {
    const rows = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function fetchFoodCatalog() {
  const { data, error } = await db.from('food_catalog').select(COLS).order('name').limit(2000);
  if (error) throw error;
  const rows = data || [];
  try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch { /* sem cache */ }
  return rows;
}
