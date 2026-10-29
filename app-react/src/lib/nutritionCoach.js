import { parseLocalDate, toDateStr } from './utils';

// Quanto da meta do dia costuma estar comido em cada hora: o dia é feito de
// refeições, não de uma reta. Pontos (hora, fração) interpolados entre si.
const PACE_CURVE = [[7, 0], [10, 0.25], [14, 0.55], [18, 0.75], [21, 1]];
const OVER_KCAL = 1.1;
const LATE_HOUR = 20;
const MAX_PORTIONS = 3;
const HABIT_DAYS = 14;
const HABIT_MIN_DAYS = 2;
const HABIT_SHARE = 0.4;
const HABIT_MAX_ITEMS = 6;
const LAST_MEAL_MAX_AGE = 3;
const SPREAD_MIN_PROTEIN = 50;
const SPREAD_MAX_SHARE = 0.65;

export function expectedShare(hour) {
  if (hour <= PACE_CURVE[0][0]) return 0;
  for (let i = 1; i < PACE_CURVE.length; i++) {
    const [h1, f1] = PACE_CURVE[i];
    if (hour <= h1) {
      const [h0, f0] = PACE_CURVE[i - 1];
      return f0 + ((hour - h0) / (h1 - h0)) * (f1 - f0);
    }
  }
  return 1;
}

// Ritmo do dia: compara o que já foi comido com o esperado para a hora.
// hour aceita fração (14.5 = 14h30). null sem meta de proteína.
export function dayPace(totals, goals, hour) {
  if (!goals?.protein) return null;
  const expectedG = Math.round(goals.protein * expectedShare(hour));
  const left = { protein: Math.max(0, goals.protein - totals.protein), kcal: goals.kcal ? goals.kcal - totals.kcal : null };
  let status;
  if (goals.kcal && totals.kcal > goals.kcal * OVER_KCAL) status = 'over_kcal';
  else if (totals.protein >= goals.protein) status = 'done';
  else if (hour >= LATE_HOUR && left.protein >= goals.protein * 0.3) status = 'late';
  else if (expectedG - totals.protein >= Math.max(10, goals.protein * 0.15)) status = 'behind';
  else status = 'on_track';
  return { status, expectedG, behindG: Math.max(0, expectedG - totals.protein), left };
}

// Até 3 porções de um alimento que fecham a proteína que falta sem estourar as
// calorias que sobram. Ranqueia pelo quanto cobre do que falta e pela
// densidade (fração das calorias que vem de proteína). foods: { g, kcal, ... }.
export function suggestFoods(foods, left, limit = 3) {
  if (!left || left.protein <= 0) return [];
  const kcalRoom = left.kcal == null ? Infinity : left.kcal;
  const out = [];
  for (const food of foods || []) {
    if (!(food.g >= 5) || !(food.kcal > 0)) continue;
    const density = Math.min(1, (food.g * 4) / food.kcal);
    // Sem espaço de calorias, só vale o que é quase só proteína, uma porção.
    if (kcalRoom <= 0 && density < 0.5) continue;
    let n = Math.min(MAX_PORTIONS, Math.max(1, Math.round(left.protein / food.g)));
    while (n > 1 && n * food.kcal > kcalRoom) n--;
    if (kcalRoom > 0 && n * food.kcal > kcalRoom * OVER_KCAL) continue;
    const coverage = Math.min(1, (n * food.g) / left.protein);
    out.push({ food, n, g: n * food.g, kcal: n * food.kcal, score: coverage * 0.6 + density * 0.4 });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

// Junta n porções num registro só: "2× Ovo".
export function portionFood({ food, n }) {
  return {
    ...food,
    label: n > 1 ? `${n}× ${food.label}` : food.label,
    g: food.g * n, kcal: food.kcal * n, carbs: (food.carbs || 0) * n, fat: (food.fat || 0) * n,
    ...(food.fiber != null && { fiber: Math.round(food.fiber * n * 10) / 10 }),
    ...(food.sodium != null && { sodium: food.sodium * n }),
  };
}

const norm = s => (s || '').trim().toLowerCase();
const rowFood = r => ({
  icon: r.icon || '🍽️', label: r.name, g: r.protein_g || 0, kcal: r.kcal || 0, carbs: r.carbs_g || 0, fat: r.fat_g || 0,
  ...(r.fiber_g != null && { fiber: Number(r.fiber_g) }),
  ...(r.sodium_mg != null && { sodium: Number(r.sodium_mg) }),
});

// O que a pessoa costuma comer nesta refeição, pelo diário dos últimos 14 dias
// (linhas de nutrition_entries, sem o dia de hoje). "usual": itens que
// aparecem em 2+ dias e em 40%+ dos dias com essa refeição. Sem hábito ainda,
// "last": a mesma refeição do dia mais recente (até 3 dias atrás). Some o que
// já foi lançado hoje nessa refeição.
export function mealHabit(rows, meal, today, todayEntries = []) {
  const start = parseLocalDate(today);
  start.setDate(start.getDate() - HABIT_DAYS);
  const since = toDateStr(start);
  const past = (rows || []).filter(r => r.meal === meal && r.log_date < today && r.log_date >= since);
  if (!past.length) return null;
  const already = new Set(todayEntries.filter(e => e.meal === meal).map(e => norm(e.label)));

  const days = new Set(past.map(r => r.log_date));
  const byName = new Map();
  for (const r of past) {
    const key = norm(r.name);
    if (!key) continue;
    const cur = byName.get(key) || { days: new Set(), row: r };
    cur.days.add(r.log_date);
    if (r.log_date >= cur.row.log_date) cur.row = r;
    byName.set(key, cur);
  }
  const usual = [...byName.entries()]
    .filter(([key, v]) => !already.has(key) && v.days.size >= HABIT_MIN_DAYS && v.days.size >= days.size * HABIT_SHARE)
    .sort((a, b) => b[1].days.size - a[1].days.size)
    .slice(0, HABIT_MAX_ITEMS)
    .map(([, v]) => rowFood(v.row));
  if (usual.length) return { kind: 'usual', items: usual };

  const lastDate = [...days].sort().pop();
  const age = Math.round((parseLocalDate(today) - parseLocalDate(lastDate)) / 86400000);
  if (age > LAST_MEAL_MAX_AGE) return null;
  const items = past.filter(r => r.log_date === lastDate && !already.has(norm(r.name))).map(rowFood).slice(0, HABIT_MAX_ITEMS);
  return items.length ? { kind: 'last', date: lastDate, items } : null;
}

// Proteína concentrada numa refeição só: o corpo aproveita melhor distribuída.
// Devolve a refeição que concentra, ou null.
export function proteinSpread(entries) {
  const byMeal = {};
  for (const e of entries || []) byMeal[e.meal] = (byMeal[e.meal] || 0) + (e.g || 0);
  const total = Object.values(byMeal).reduce((s, g) => s + g, 0);
  if (total < SPREAD_MIN_PROTEIN) return null;
  const [meal, g] = Object.entries(byMeal).sort((a, b) => b[1] - a[1])[0];
  return g / total >= SPREAD_MAX_SHARE ? { meal, share: Math.round((g / total) * 100) } : null;
}

// Nova meta de calorias sugerida quando o peso empaca com as calorias na meta:
// 7% a menos para perder, 7% a mais para ganhar. null quando não se aplica.
export function suggestedKcal(kcalGoal, reading, meta) {
  if (reading !== 'plateau' || !kcalGoal) return null;
  const factor = meta === 'massa' ? 1.07 : meta === 'emagrecer' || meta === 'definicao' ? 0.93 : null;
  return factor ? Math.round((kcalGoal * factor) / 10) * 10 : null;
}
