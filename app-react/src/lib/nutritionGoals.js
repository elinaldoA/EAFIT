import { BODY_LIMITS } from './profileValidation';

// Meta principal quando a conta não tem uma salva (a mesma do cadastro).
export const DEFAULT_META = 'massa';

const PROFILE_FIELDS = ['sexo', 'idade', 'peso', 'altura', 'meta', 'weeklyGoal'];

// Dados do perfil que entram nas metas de nutrição, lidos como o Perfil lê:
// o que está na conta, senão a cópia do aparelho (profile_*), senão o padrão.
// Perfil e Nutrição usam esta mesma leitura: antes a Nutrição lia só a conta e,
// para quem não tinha a meta salva nela, mostrava calorias e proteína diferentes
// das do Perfil.
export function nutritionProfile(md = {}, storage = globalThis.localStorage) {
  const read = key => {
    try { return storage?.getItem(`profile_${key}`) || ''; } catch { return ''; }
  };
  const out = { ...md };
  for (const key of PROFILE_FIELDS) out[key] = md[key] || read(key) || '';
  out.meta ||= DEFAULT_META;
  return out;
}

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
export const MIN_KCAL = { M: 1500, F: 1200 };
// Fibra: 14 g a cada 1000 kcal (Dietary Reference Intakes). Sódio: teto de
// 2000 mg por dia (OMS).
const FIBER_PER_1000_KCAL = 14;
export const SODIUM_LIMIT_MG = 2000;
const SUGAR_KCAL_SHARE = 0.1;
const SAT_FAT_KCAL_SHARE = 0.1;

// Fator de calorias da meta principal sobre o gasto do dia.
export const goalKcalFactor = meta => (GOAL_PLAN[meta] || GOAL_PLAN.saude).kcalFactor;

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
// por dia, mais a meta de fibra e o teto de sódio. Devolve null enquanto faltar sexo, idade, peso ou altura válidos.
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
  const fiber = Math.round((kcal / 1000) * FIBER_PER_1000_KCAL);
  // Teto de açúcares e de gordura saturada: 10% das calorias (OMS), em gramas.
  const sugar = Math.round((kcal * SUGAR_KCAL_SHARE) / 4);
  const satFat = Math.round((kcal * SAT_FAT_KCAL_SHARE) / 9);
  return { kcal, protein, carbs, fat, fiber, sodium: SODIUM_LIMIT_MG, sugar, satFat };
}
