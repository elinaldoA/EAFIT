import { BODY_LIMITS } from './profileValidation';

// Ajuste de calorias sobre o gasto total (TDEE) e proteína em g/kg por meta.
const GOAL_PLAN = {
  massa:       { kcalFactor: 1.10, proteinPerKg: 2.0 },
  forca:       { kcalFactor: 1.05, proteinPerKg: 1.8 },
  emagrecer:   { kcalFactor: 0.80, proteinPerKg: 2.0 },
  definicao:   { kcalFactor: 0.90, proteinPerKg: 2.2 },
  saude:       { kcalFactor: 1.00, proteinPerKg: 1.4 },
  resistencia: { kcalFactor: 1.00, proteinPerKg: 1.5 },
};
const FAT_KCAL_SHARE = 0.25;
const MIN_KCAL = { M: 1500, F: 1200 };

// Fator de atividade pela frequência semanal de treino.
// Sem meta salva vale o padrão do app (5 treinos), o mesmo do Perfil.
function activityFactor(weeklyGoal) {
  const days = parseInt(weeklyGoal, 10) || 5;
  if (days <= 1) return 1.2;
  if (days <= 3) return 1.375;
  if (days <= 5) return 1.55;
  return 1.725;
}

const inRange = (v, [min, max]) => Number.isFinite(v) && v >= min && v <= max;

// Estimativa (Mifflin-St Jeor) de calorias, proteína, carboidrato e gordura
// por dia. Devolve null enquanto faltar sexo, idade, peso ou altura válidos.
export function computeNutritionGoals({ sexo, idade, peso, altura, meta, weeklyGoal } = {}) {
  const age = parseFloat(idade);
  const kg = parseFloat(peso);
  const cm = parseFloat(altura);
  if (!['M', 'F'].includes(sexo)) return null;
  if (!inRange(age, BODY_LIMITS.idade) || !inRange(kg, BODY_LIMITS.peso) || !inRange(cm, BODY_LIMITS.altura)) return null;

  const bmr = 10 * kg + 6.25 * cm - 5 * age + (sexo === 'M' ? 5 : -161);
  const plan = GOAL_PLAN[meta] || GOAL_PLAN.saude;
  const kcal = Math.max(MIN_KCAL[sexo], Math.round((bmr * activityFactor(weeklyGoal) * plan.kcalFactor) / 10) * 10);

  const protein = Math.round(kg * plan.proteinPerKg);
  const fat = Math.round((kcal * FAT_KCAL_SHARE) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carbs, fat };
}
