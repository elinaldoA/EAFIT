// Lembretes de nutrição do send-reminders: refeição sem registro, proteína
// abaixo da meta no fim da tarde e resumo semanal. Regras e textos ficam aqui,
// separados do index, pra serem testáveis sem rede/banco.
import type { Lang } from './lang.ts';

type Text = { title: string; body: string };

// Mantenha em sincronia com GOAL_PLAN/BODY_LIMITS em
// app-react/src/lib/nutritionGoals.js e profileValidation.js — duplicado de
// propósito (Deno e Vite não compartilham módulos), mas a meta do aviso tem
// que ser a mesma que o usuário vê na aba Nutrição.
const PROTEIN_PER_KG: Record<string, number> = {
  massa: 2.0, forca: 1.8, emagrecer: 2.0, definicao: 2.2, saude: 1.4, resistencia: 1.5,
};
const BODY_LIMITS = { idade: [14, 100], peso: [30, 300], altura: [100, 250] } as const;

const inRange = (v: number, [min, max]: readonly [number, number]) => Number.isFinite(v) && v >= min && v <= max;

// Meta diária de proteína (g), ou null enquanto faltar sexo, idade, peso ou altura válidos.
export function proteinGoal(meta: Record<string, unknown>): number | null {
  const age = parseFloat(String(meta.idade));
  const kg = parseFloat(String(meta.peso));
  const cm = parseFloat(String(meta.altura));
  if (meta.sexo !== 'M' && meta.sexo !== 'F') return null;
  if (!inRange(age, BODY_LIMITS.idade) || !inRange(kg, BODY_LIMITS.peso) || !inRange(cm, BODY_LIMITS.altura)) return null;
  const perKg = PROTEIN_PER_KG[String(meta.meta)] ?? PROTEIN_PER_KG.saude;
  return Math.round(kg * perKg);
}

// Horários (Brasília). Fora deles o send-reminders não faz nenhuma query de nutrição.
// Cada lembrete sai no horário em que a refeição costuma acontecer.
// Mantenha em sincronia com mealForHour em app-react/src/lib/nutritionEntries.js.
export const MEAL_REMINDERS = [
  { time: '07:00', meal: 'cafe' },
  { time: '12:00', meal: 'almoco' },
  { time: '16:00', meal: 'lanche' },
  { time: '20:00', meal: 'jantar' },
  { time: '22:00', meal: 'ceia' },
] as const;
export type Meal = typeof MEAL_REMINDERS[number]['meal'];
export const PROTEIN_GAP_TIME = '18:00';
export const NUTRITION_SUMMARY_TIME = '08:30'; // só às segundas-feiras

// Só quem usa o diário recebe lembrete de refeição: registrou em pelo menos
// 3 dos últimos 7 dias. Pra quem nunca registra, o aviso seria só ruído.
export const DIARY_MIN_DAYS = 3;
export const DIARY_LOOKBACK_DAYS = 7;

// Diferença mínima pra valer o aviso de proteína: com 10g faltando ninguém
// precisa ser lembrado.
export const PROTEIN_GAP_MIN_G = 20;

export function isDiaryUser(daysLogged: number): boolean {
  return daysLogged >= DIARY_MIN_DAYS;
}

// Lanche e ceia nem todo mundo faz: só lembra quem registrou essa refeição em
// pelo menos 2 dos últimos 7 dias. Café, almoço e jantar valem pra todo usuário do diário.
const OPTIONAL_MEALS: readonly Meal[] = ['lanche', 'ceia'];
export const MEAL_HABIT_MIN_DAYS = 2;

export function shouldRemindMeal(meal: Meal, diaryDays: number, mealDays: number, loggedToday: boolean): boolean {
  if (loggedToday || !isDiaryUser(diaryDays)) return false;
  return !OPTIONAL_MEALS.includes(meal) || mealDays >= MEAL_HABIT_MIN_DAYS;
}

// Faltam quantos gramas, ou null se não vale avisar (sem meta, nada registrado
// hoje — esse caso é do protein_today do engajamento — ou perto da meta).
export function proteinGap(goal: number | null, todayG: number): number | null {
  if (!goal || !(todayG > 0)) return null;
  const left = goal - todayG;
  return left >= PROTEIN_GAP_MIN_G ? left : null;
}

export type WeekNutrition = { daysLogged: number; avgProtein: number; daysOnGoal: number | null };

export type DayLog = { protein: number; kcal: number };

// Resumo de uma semana a partir das linhas de protein_logs. Conta como
// registrado o dia com proteína ou calorias (quem anotou só carboidrato também).
export function summarizeWeek(days: DayLog[], goal: number | null): WeekNutrition | null {
  const logged = days.filter((d) => d.protein > 0 || d.kcal > 0);
  if (!logged.length) return null;
  return {
    daysLogged: logged.length,
    avgProtein: Math.round(logged.reduce((s, d) => s + d.protein, 0) / logged.length),
    daysOnGoal: goal ? logged.filter((d) => d.protein >= goal).length : null,
  };
}

const MEAL_TEXTS: Record<Lang, Record<Meal, Text>> = {
  pt: {
    cafe: { title: '☕ Já tomou café da manhã?', body: 'Registre o café da manhã na Nutrição pra começar o dia com os totais certos.' },
    almoco: { title: '🍽️ Como foi o almoço?', body: 'Registre o almoço na Nutrição pra manter os totais de hoje certos.' },
    lanche: { title: '🍎 E o lanche da tarde?', body: 'Se fez um lanche, anote na Nutrição. Leva um minuto!' },
    jantar: { title: '🍽️ Já registrou o jantar?', body: 'O jantar ainda não está no diário de hoje. Leva um minuto!' },
    ceia: { title: '🌙 Hora da ceia', body: 'Se comeu algo antes de dormir, anote na Nutrição pra fechar o dia.' },
  },
  en: {
    cafe: { title: '☕ Had breakfast?', body: 'Log your breakfast in Nutrition to start the day with the right totals.' },
    almoco: { title: '🍽️ How was lunch?', body: 'Log your lunch in Nutrition to keep today\'s totals right.' },
    lanche: { title: '🍎 What about your afternoon snack?', body: 'If you had a snack, log it in Nutrition. It takes a minute!' },
    jantar: { title: '🍽️ Did you log dinner?', body: 'Dinner is still missing from today\'s diary. It takes a minute!' },
    ceia: { title: '🌙 Late-night snack', body: 'If you ate something before bed, log it in Nutrition to close the day.' },
  },
};

export function mealText(lang: Lang, meal: Meal): Text {
  return MEAL_TEXTS[lang][meal];
}

export function proteinGapText(lang: Lang, left: number, goal: number): Text {
  return lang === 'en'
    ? { title: '🥩 Protein still to go', body: `${left}g left to reach today's ${goal}g goal. Plan it into dinner.` }
    : { title: '🥩 Ainda falta proteína hoje', body: `Faltam ${left}g pra meta de ${goal}g. Dá pra encaixar no jantar.` };
}

export function nutritionSummaryText(lang: Lang, w: WeekNutrition): Text {
  if (lang === 'en') {
    const goalPart = w.daysOnGoal === null ? '' : ` · protein goal hit on ${w.daysOnGoal} ${w.daysOnGoal === 1 ? 'day' : 'days'}`;
    return {
      title: '🥗 Your week in nutrition',
      body: `Logged ${w.daysLogged}/7 days · ${w.avgProtein}g of protein per day on average${goalPart}.`,
    };
  }
  const goalPart = w.daysOnGoal === null ? '' : ` · meta de proteína batida em ${w.daysOnGoal} ${w.daysOnGoal === 1 ? 'dia' : 'dias'}`;
  return {
    title: '🥗 Sua semana na nutrição',
    body: `Registrou ${w.daysLogged}/7 dias · média de ${w.avgProtein}g de proteína por dia${goalPart}.`,
  };
}
