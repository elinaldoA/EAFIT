export const EMPTY_TOTALS = { protein: 0, kcal: 0, carbs: 0, fat: 0 };

const clean = n => Math.max(0, Math.round(Number(n) || 0));

// Soma (sign = 1) ou subtrai (sign = -1) um alimento dos totais do dia.
// Nenhum total fica negativo. food: { g, kcal, carbs, fat } (g = proteína).
export function applyFood(totals, food, sign = 1) {
  const t = totals || EMPTY_TOTALS;
  return {
    protein: clean(t.protein + sign * clean(food.g)),
    kcal: clean(t.kcal + sign * clean(food.kcal)),
    carbs: clean(t.carbs + sign * clean(food.carbs)),
    fat: clean(t.fat + sign * clean(food.fat)),
  };
}

// Normaliza o que veio do storage/servidor para totais válidos.
export function normalizeTotals(raw) {
  return {
    protein: clean(raw?.protein),
    kcal: clean(raw?.kcal),
    carbs: clean(raw?.carbs),
    fat: clean(raw?.fat),
  };
}

// Percentual (0–100) de um total em relação à meta; 0 sem meta.
export function pctOfGoal(value, goal) {
  return goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
}
