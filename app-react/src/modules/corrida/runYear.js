import { mondayOf } from './program';
import { addDays } from '../../lib/pause';
import { paceSeconds, bestEffort } from './runs';

// Retrospectiva do ano (o "Year in Sport"): os números do ano e os destaques, a
// partir das corridas já carregadas. Tudo calculado; nada vai para o banco.

// Ano da retrospectiva: o de hoje, ou o último com corrida se este ainda não tem (começo de janeiro).
export function recapYear(runs, today) {
  const year = today.slice(0, 4);
  if (runs.some(r => r.run_date.startsWith(year))) return year;
  const years = [...new Set(runs.map(r => r.run_date.slice(0, 4)))].filter(y => y < year).sort();
  return years.at(-1) || null;
}

const daypart = hour => (hour >= 5 && hour < 12 ? 'manha' : hour >= 12 && hour < 18 ? 'tarde' : hour >= 18 && hour < 23 ? 'noite' : 'madrugada');

// Maior sequência de semanas seguidas com corrida dentro de `list`.
function streakWeeks(list) {
  const weeks = [...new Set(list.map(r => mondayOf(r.run_date)))].sort();
  let best = 0;
  let cur = 0;
  let prev = null;
  for (const w of weeks) {
    cur = prev && addDays(prev, 7) === w ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = w;
  }
  return best;
}

// null sem corridas no ano. Devolve:
//   year, count, meters, seconds, elevM, days (dias com corrida), pace,
//   months: 12 valores em metros (jan a dez), bestMonth: { month 1-12, meters },
//   weekday: dia da semana mais frequente (0 = domingo) e weekdayCount,
//   daypart: 'manha' | 'tarde' | 'noite' | 'madrugada' (mais frequente; null sem hora),
//   longest: { meters, date }, effort5: melhor 5 km em s (null sem GPS), streak (semanas),
//   vsPrev: variação % de km sobre o ano anterior (null sem ano anterior).
export function yearRecap(runs, year) {
  const list = runs.filter(r => r.run_date.startsWith(`${year}-`));
  if (!list.length) return null;
  const meters = list.reduce((s, r) => s + r.distance_m, 0);
  const seconds = list.reduce((s, r) => s + r.duration_s, 0);
  const months = Array(12).fill(0);
  const weekdays = Array(7).fill(0);
  const parts = {};
  for (const r of list) {
    months[Number(r.run_date.slice(5, 7)) - 1] += r.distance_m;
    weekdays[new Date(`${r.run_date}T12:00:00`).getDay()] += 1;
    if (r.started_at) {
      const part = daypart(new Date(r.started_at).getHours());
      parts[part] = (parts[part] || 0) + 1;
    }
  }
  const bestIdx = months.indexOf(Math.max(...months));
  const wd = weekdays.indexOf(Math.max(...weekdays));
  const topPart = Object.entries(parts).sort((a, b) => b[1] - a[1])[0];
  const longest = list.reduce((m, r) => (r.distance_m > m.meters ? { meters: r.distance_m, date: r.run_date } : m), { meters: 0, date: null });
  let effort5 = null;
  for (const r of list) {
    const e = bestEffort(r.splits, 5);
    if (e !== null && (effort5 === null || e < effort5)) effort5 = e;
  }
  const prevM = runs.filter(r => r.run_date.startsWith(`${Number(year) - 1}-`)).reduce((s, r) => s + r.distance_m, 0);
  return {
    year,
    count: list.length,
    meters,
    seconds,
    elevM: list.reduce((s, r) => s + (r.elev_gain_m || 0), 0),
    days: new Set(list.map(r => r.run_date)).size,
    pace: paceSeconds(seconds, meters),
    months,
    bestMonth: { month: bestIdx + 1, meters: months[bestIdx] },
    weekday: wd,
    weekdayCount: weekdays[wd],
    daypart: topPart ? topPart[0] : null,
    longest,
    effort5,
    streak: streakWeeks(list),
    vsPrev: prevM > 0 ? Math.round(((meters - prevM) / prevM) * 100) : null,
  };
}
