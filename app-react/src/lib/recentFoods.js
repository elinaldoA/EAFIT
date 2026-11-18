// Alimentos que a pessoa já registrou, para a busca oferecer antes de digitar.
// `rows`: linhas de nutrition_entries dos últimos dias; `entries`: o diário de
// hoje (já no formato da tela). Cada porção registrada ("Arroz 150g") conta como
// um item, com os mesmos valores; vêm antes os mais repetidos, depois os mais recentes.
const norm = s => (s || '').trim().toLowerCase();

const fromRow = r => ({
  icon: r.icon || '🍽️', label: r.name, g: r.protein_g || 0, kcal: r.kcal || 0, carbs: r.carbs_g || 0, fat: r.fat_g || 0,
  ...(r.fiber_g != null && { fiber: Number(r.fiber_g) }),
  ...(r.sodium_mg != null && { sodium: Number(r.sodium_mg) }),
  ...(r.sugar_g != null && { sugar: Number(r.sugar_g) }),
  ...(r.sat_fat_g != null && { satFat: Number(r.sat_fat_g) }),
});

export function recentFoods(rows, entries = [], today, limit = 8) {
  const seen = new Map();
  const add = (food, date) => {
    const key = norm(food.label);
    if (!key) return;
    const cur = seen.get(key) || { food, count: 0, last: '' };
    cur.count += 1;
    if (date >= cur.last) { cur.last = date; cur.food = food; }
    seen.set(key, cur);
  };
  (rows || []).forEach(r => add(fromRow(r), r.log_date || ''));
  (entries || []).forEach(e => add(e, today || '9999'));
  return [...seen.values()]
    .sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1))
    .slice(0, limit)
    .map(v => v.food);
}

// Nomes (sem acento, sem a porção do fim) dos alimentos já registrados: sobem na busca.
const plain = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export function usedNames(foods) {
  return new Set(foods.map(f => plain((f.label || '').replace(/\s+\d+(?:[.,]\d+)?\s*g$/i, ''))).filter(Boolean));
}

// A refeição de ontem (a mesma `meal`), para repetir de uma vez. Vazio se hoje
// já tem algo nessa refeição ou se ontem não teve.
export function yesterdayMeal(rows, entries, meal, yesterday) {
  if ((entries || []).some(e => e.meal === meal)) return [];
  return (rows || []).filter(r => r.log_date === yesterday && r.meal === meal).map(fromRow);
}
