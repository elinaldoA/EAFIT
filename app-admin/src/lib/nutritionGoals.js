// Espelha app-react/src/lib/nutritionGoals.js — os dois apps não compartilham
// build, então a regra é duplicada aqui só para exibir a meta que o usuário vê.
const GOAL_PLAN = {
  massa:       { kcalFactor: 1.10, proteinPerKg: 2.0 },
  forca:       { kcalFactor: 1.05, proteinPerKg: 1.8 },
  emagrecer:   { kcalFactor: 0.80, proteinPerKg: 2.0 },
  definicao:   { kcalFactor: 0.90, proteinPerKg: 2.2 },
  saude:       { kcalFactor: 1.00, proteinPerKg: 1.4 },
  resistencia: { kcalFactor: 1.00, proteinPerKg: 1.5 },
};
const MIN_KCAL = { M: 1500, F: 1200 };
const LIMITS = { idade: [14, 100], peso: [30, 300], altura: [100, 250] };

function activityFactor(weeklyGoal) {
  const days = parseInt(weeklyGoal, 10) || 5;
  if (days <= 1) return 1.2;
  if (days <= 3) return 1.375;
  if (days <= 5) return 1.55;
  return 1.725;
}

const inRange = (v, [min, max]) => Number.isFinite(v) && v >= min && v <= max;

// null enquanto faltar sexo, idade, peso ou altura válidos no perfil.
export function computeNutritionGoals({ sexo, idade, peso, altura, meta, weeklyGoal } = {}) {
  const age = parseFloat(idade);
  const kg = parseFloat(peso);
  const cm = parseFloat(altura);
  if (!['M', 'F'].includes(sexo)) return null;
  if (!inRange(age, LIMITS.idade) || !inRange(kg, LIMITS.peso) || !inRange(cm, LIMITS.altura)) return null;

  const bmr = 10 * kg + 6.25 * cm - 5 * age + (sexo === 'M' ? 5 : -161);
  const plan = GOAL_PLAN[meta] || GOAL_PLAN.saude;
  const kcal = Math.max(MIN_KCAL[sexo], Math.round((bmr * activityFactor(weeklyGoal) * plan.kcalFactor) / 10) * 10);
  const protein = Math.round(kg * plan.proteinPerKg);
  const fat = Math.round((kcal * 0.25) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carbs, fat };
}
