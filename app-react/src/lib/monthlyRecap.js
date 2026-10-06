import { db } from './supabase';

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const pad = n => String(n).padStart(2, '0');

// 'YYYY-MM-DD' → { y, m (0-11), d }. Só componentes: nada de fuso do navegador.
function parts(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { y, m: m - 1, d };
}

function weekdayOf(dateStr) {
  const { y, m, d } = parts(dateStr);
  return new Date(Date.UTC(y, m, d)).getUTCDay();
}

function dayNumber(dateStr) {
  const { y, m, d } = parts(dateStr);
  return Math.round(Date.UTC(y, m, d) / 86400000);
}

// Limites do mês de `today` deslocado por `offset` (0 = este mês, -1 = anterior).
export function monthBounds(today, offset = 0) {
  const { y, m } = parts(today);
  const first = new Date(Date.UTC(y, m + offset, 1));
  const fy = first.getUTCFullYear();
  const fm = first.getUTCMonth();
  const last = new Date(Date.UTC(fy, fm + 1, 0)).getUTCDate();
  return {
    start: `${fy}-${pad(fm + 1)}-01`,
    end: `${fy}-${pad(fm + 1)}-${pad(last)}`,
    label: `${MONTHS[fm]} de ${fy}`,
  };
}

function inRange(date, { start, end }) {
  return date >= start && date <= end;
}

// Maior sequência de dias seguidos entre as datas dadas.
export function longestStreak(dates) {
  const days = [...new Set(dates)].map(dayNumber).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev = null;
  for (const n of days) {
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = n;
  }
  return best;
}

export function pctChange(cur, prev) {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

// Retrospectiva do mês: tudo calculado dos treinos concluídos e das séries
// feitas (as mesmas fontes do Dashboard). `allTimeLogs` = séries com carga de
// todo o histórico ({ exercise_name, carga, reps, workout_date }).
export function buildMonthlyRecap({ workouts, allTimeLogs, today, offset = 0 }) {
  const range = monthBounds(today, offset);
  const prevRange = monthBounds(today, offset - 1);

  const done = (workouts || []).filter(w => w.completed);
  const inMonth = done.filter(w => inRange(w.workout_date, range));
  const inPrev = done.filter(w => inRange(w.workout_date, prevRange));
  const dates = [...new Set(inMonth.map(w => w.workout_date))];

  const minutes = Math.round(inMonth.reduce((a, w) => a + (Number(w.duration_seconds) || 0), 0) / 60);

  let volume = 0;
  const bestBefore = {};
  const bestInMonth = {};
  for (const s of allTimeLogs || []) {
    const carga = parseFloat(s.carga);
    if (!Number.isFinite(carga) || carga <= 0 || !s.workout_date) continue;
    if (inRange(s.workout_date, range)) {
      const reps = parseFloat(s.reps);
      if (Number.isFinite(reps) && reps > 0) volume += carga * reps;
      bestInMonth[s.exercise_name] = Math.max(bestInMonth[s.exercise_name] || 0, carga);
    } else if (s.workout_date < range.start) {
      bestBefore[s.exercise_name] = Math.max(bestBefore[s.exercise_name] || 0, carga);
    }
  }
  // Recorde = bateu a maior carga que já tinha registrada (o primeiro registro
  // de um exercício não conta como recorde).
  const prCount = Object.keys(bestInMonth).filter(n => bestBefore[n] && bestInMonth[n] > bestBefore[n]).length;

  const byWeekday = {};
  inMonth.forEach(w => { const d = weekdayOf(w.workout_date); byWeekday[d] = (byWeekday[d] || 0) + 1; });
  const favEntry = Object.entries(byWeekday).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];

  return {
    label: range.label,
    treinos: inMonth.length,
    treinosPrev: inPrev.length,
    deltaPct: pctChange(inMonth.length, inPrev.length),
    activeDays: dates.length,
    minutes,
    volume: Math.round(volume),
    prCount,
    bestStreak: longestStreak(dates),
    favWeekday: favEntry ? WEEKDAYS[Number(favEntry[0])] : null,
  };
}

export function formatMinutes(total) {
  if (!total) return '0 min';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}h${m ? ` ${m}min` : ''}` : `${m} min`;
}

// Treinos do mês anterior e do atual (a retrospectiva compara os dois).
export async function fetchRecapWorkouts(userId, today) {
  const since = monthBounds(today, -2).start;
  const { data, error } = await db
    .from('workouts')
    .select('workout_date, completed, duration_seconds')
    .eq('user_id', userId)
    .gte('workout_date', since);
  if (error) throw error;
  return data || [];
}
