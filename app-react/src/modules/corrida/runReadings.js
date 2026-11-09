import { mondayOf } from './program';
import { addDays } from '../../lib/pause';
import { paceSeconds, bestEffort } from './runs';
import { t } from '../../lib/i18n';

// Leituras em cima das corridas já carregadas (nada aqui lê o banco): conquistas,
// carga da semana, previsão de tempo de prova e tendência de ritmo.

const HALF_M = 21097;
const MARATHON_M = 42195;

// ---- Conquistas ------------------------------------------------------------

// Maior sequência de semanas seguidas com corrida, em qualquer época.
export function longestStreakWeeks(runs) {
  const weeks = [...new Set(runs.map(r => mondayOf(r.run_date)))].sort();
  let best = 0;
  let current = 0;
  let prev = null;
  for (const w of weeks) {
    current = prev && addDays(prev, 7) === w ? current + 1 : 1;
    if (current > best) best = current;
    prev = w;
  }
  return best;
}

// Cada conquista: id, ícone, título, o que falta e o progresso (0 a 1).
const TOTAL_KM_STEPS = [50, 100, 250, 500, 1000];
const COUNT_STEPS = [1, 10, 50, 100];
const STREAK_STEPS = [4, 12, 26];

export function achievements(runs) {
  const totalKm = runs.reduce((s, r) => s + (r.distance_m || 0), 0) / 1000;
  const longestM = runs.reduce((m, r) => Math.max(m, r.distance_m || 0), 0);
  const streak = longestStreakWeeks(runs);
  const count = runs.length;
  const list = [];
  const add = (id, icon, title, have, need) => list.push({
    id, icon, title, unlocked: have >= need, progress: Math.min(1, have / need),
  });
  for (const n of COUNT_STEPS) {
    add(`count-${n}`, '🏃', n === 1 ? t('Primeira corrida') : t('{v1} corridas', { v1: n }), count, n);
  }
  add('dist-5', '5️⃣', t('Correu 5 km de uma vez'), longestM, 5000);
  add('dist-10', '🔟', t('Correu 10 km de uma vez'), longestM, 10000);
  add('dist-21', '🏅', t('Meia maratona'), longestM, HALF_M);
  add('dist-42', '🏆', t('Maratona'), longestM, MARATHON_M);
  for (const n of TOTAL_KM_STEPS) add(`total-${n}`, '🌍', t('{v1} km no total', { v1: n }), totalKm, n);
  for (const n of STREAK_STEPS) add(`streak-${n}`, '🔥', t('{v1} semanas seguidas', { v1: n }), streak, n);
  return list;
}

// Conquistas que `afterRuns` desbloqueou e `beforeRuns` ainda não tinha.
export function newAchievements(beforeRuns, afterRuns) {
  const had = new Set(achievements(beforeRuns).filter(a => a.unlocked).map(a => a.id));
  return achievements(afterRuns).filter(a => a.unlocked && !had.has(a.id));
}

// ---- Carga da semana -------------------------------------------------------

// A regra dos 10%: subir mais que isso de uma semana para a outra pesa no corpo.
export const LOAD_LIMIT = 1.1;

const sumBetween = (runs, from, to) => runs.filter(r => r.run_date >= from && r.run_date <= to)
  .reduce((s, r) => s + (r.distance_m || 0), 0);

// { thisWeek, lastWeek, avg4, roomM, level }, tudo em metros. level:
//   null     sem corrida nas últimas semanas (nada a comparar)
//   'alto'   a semana já passou de 10% sobre a anterior
//   'ok'     dentro do limite (roomM = quanto ainda cabe)
export function weeklyLoad(runs, today) {
  const monday = mondayOf(today);
  const lastMonday = addDays(monday, -7);
  const thisWeek = sumBetween(runs, monday, today);
  const lastWeek = sumBetween(runs, lastMonday, addDays(monday, -1));
  const prev = [2, 3, 4].map(i => sumBetween(runs, addDays(monday, -7 * i), addDays(monday, -7 * i + 6)));
  const avg4 = (lastWeek + prev.reduce((a, b) => a + b, 0)) / 4;
  if (!lastWeek) return { thisWeek, lastWeek, avg4, roomM: 0, level: null };
  const limit = lastWeek * LOAD_LIMIT;
  return { thisWeek, lastWeek, avg4, roomM: Math.max(0, limit - thisWeek), level: thisWeek > limit ? 'alto' : 'ok' };
}

// Esforço médio (1 a 10) das corridas da semana que o informaram; null sem nenhum.
export function weekEffort(runs, today) {
  const rated = runs.filter(r => r.run_date >= mondayOf(today) && r.run_date <= today && r.effort > 0);
  if (!rated.length) return null;
  return Math.round((rated.reduce((s, r) => s + r.effort, 0) / rated.length) * 10) / 10;
}

// ---- Previsão de prova -----------------------------------------------------

export const RACES = [
  { key: '5k', label: '5K', meters: 5000 },
  { key: '10k', label: '10K', meters: 10000 },
  { key: '21k', label: '21K', meters: HALF_M },
  { key: '42k', label: '42K', meters: MARATHON_M },
];

const RIEGEL = 1.06;
const BASIS_DAYS = 90;
const MIN_BASIS_M = 3000;

// Esforços recentes: cada corrida inteira e o melhor trecho de 3, 5, 10 e 21 km
// dos parciais do GPS. [{ m, s }]
function recentEfforts(runs, today) {
  const since = addDays(today, -BASIS_DAYS);
  const out = [];
  for (const r of runs) {
    if (r.run_date < since || r.run_date > today) continue;
    if (r.distance_m >= MIN_BASIS_M && r.duration_s > 0) out.push({ m: r.distance_m, s: r.duration_s });
    for (const k of [3, 5, 10, 21]) {
      const s = bestEffort(r.splits, k);
      if (s !== null && s > 0) out.push({ m: k * 1000, s });
    }
  }
  return out;
}

// Tempo previsto (s) para cada prova pela fórmula de Riegel, a partir do melhor
// esforço dos últimos 90 dias. Só usa base com pelo menos 40% da distância da
// prova (extrapolar de um treino curto engana). Sem base: null.
export function racePredictions(runs, today) {
  const efforts = recentEfforts(runs, today);
  return RACES.map(race => {
    let best = null;
    for (const e of efforts) {
      if (e.m < race.meters * 0.4) continue;
      const seconds = e.s * (race.meters / e.m) ** RIEGEL;
      if (best === null || seconds < best) best = seconds;
    }
    return { ...race, seconds: best === null ? null : Math.round(best) };
  });
}

// ---- Tendência de ritmo ----------------------------------------------------

// Ritmo médio (s/km) das últimas 4 semanas contra as 4 anteriores.
// { recent, before, delta } com delta negativo = ficou mais rápido; null sem
// corridas suficientes nos dois períodos (pelo menos 2 em cada).
export function paceTrend(runs, today) {
  const monday = mondayOf(today);
  const split = addDays(monday, -21);      // as 4 semanas recentes começam aqui (incluem a atual)
  const start = addDays(monday, -49);
  const avg = (from, to) => {
    const list = runs.filter(r => r.run_date >= from && r.run_date <= to && paceSeconds(r.duration_s, r.distance_m) !== null);
    if (list.length < 2) return null;
    const m = list.reduce((s, r) => s + r.distance_m, 0);
    const s = list.reduce((a, r) => a + r.duration_s, 0);
    return paceSeconds(s, m);
  };
  const recent = avg(split, today);
  const before = avg(start, addDays(split, -1));
  if (recent === null || before === null) return null;
  return { recent, before, delta: recent - before };
}
