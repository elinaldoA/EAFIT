export const MAX_CUSTOM_FOODS = 20;
export const VISIBLE_FOODS = 8;

const USE_KEY = 'foodUseCount';

export function readUseCounts() {
  try {
    return JSON.parse(localStorage.getItem(USE_KEY)) || {};
  } catch {
    return {};
  }
}

export function bumpUseCount(id) {
  const counts = readUseCounts();
  counts[id] = (counts[id] || 0) + 1;
  try { localStorage.setItem(USE_KEY, JSON.stringify(counts)); } catch { /* cota cheia: só perde a ordenação */ }
  return counts;
}

// Mais usados primeiro; empate mantém a ordem original (padrões antes dos
// criados pelo usuário, que já vêm em ordem de criação).
export function sortByUse(foods, counts) {
  return foods
    .map((f, i) => ({ f, i, c: counts[f.id] || 0 }))
    .sort((a, b) => b.c - a.c || a.i - b.i)
    .map(x => x.f);
}

// Linha do banco -> o formato dos atalhos fixos ({ g, kcal, carbs, fat }).
export function foodFromRow(row) {
  return {
    id: row.id,
    custom: true,
    icon: row.icon || '🍽️',
    label: row.name,
    g: row.protein_g,
    kcal: row.kcal,
    carbs: row.carbs_g,
    fat: row.fat_g,
  };
}
