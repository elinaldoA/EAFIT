import { paceSeconds } from './runs';
import { mondayOf } from './program';
import { addDays } from '../../lib/pause';

// Resumo da semana, do mês e do ano para o cartão dos stories: só números, sem
// percurso (o mapa de cada corrida não vai para fora do app neste cartão).

export const SUMMARY_PERIODS = ['week', 'month', 'year'];

const pad = n => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(y, m, 0).getDate(); // m de 1 a 12

// [de, até] (YYYY-MM-DD) do período que contém `today`, até hoje.
export function periodRange(today, period = 'month') {
  if (period === 'week') return [mondayOf(today), today];
  if (period === 'year') return [`${today.slice(0, 4)}-01-01`, today];
  return [`${today.slice(0, 7)}-01`, today];
}

// Mesmo trecho do período anterior (mesmos dias já passados), para comparar o
// mês de 17 dias com 17 dias do mês passado e não com o mês inteiro.
export function previousRange(today, period = 'month') {
  const [y, m, d] = today.split('-').map(Number);
  if (period === 'week') return [addDays(mondayOf(today), -7), addDays(today, -7)];
  if (period === 'year') {
    const py = y - 1;
    return [`${py}-01-01`, `${py}-${pad(m)}-${pad(Math.min(d, lastDay(py, m)))}`];
  }
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return [`${py}-${pad(pm)}-01`, `${py}-${pad(pm)}-${pad(Math.min(d, lastDay(py, pm)))}`];
}

const inRange = (runs, [from, to]) => runs.filter(r => r.run_date >= from && r.run_date <= to);

// Corridas do período de `today` (YYYY-MM-DD), até hoje.
export const periodRuns = (runs, today, period = 'month') => inRange(runs, periodRange(today, period));

// Corridas do mês de `today`, até hoje.
export const monthRuns = (runs, today) => periodRuns(runs, today, 'month');

function summarize(list) {
  const meters = list.reduce((s, r) => s + r.distance_m, 0);
  const seconds = list.reduce((s, r) => s + r.duration_s, 0);
  return {
    count: list.length,
    meters,
    seconds,
    pace: paceSeconds(seconds, meters), // null abaixo de 1 km no período
    longestM: Math.max(0, ...list.map(r => r.distance_m)),
  };
}

// null sem corridas no período.
export function periodSummary(runs, today, period = 'month') {
  const list = periodRuns(runs, today, period);
  if (!list.length) return null;
  return { month: today.slice(0, 7), ...summarize(list) };
}

// null sem corridas no mês.
export const monthSummary = (runs, today) => periodSummary(runs, today, 'month');

// Quanto o período andou a mais ou a menos que o anterior: { kmPct, paceDelta }.
// paceDelta em s/km (negativo = ficou mais rápido), null se faltar base para o
// ritmo. null sem corridas num dos dois períodos (nada a comparar).
export function comparePeriod(runs, today, period = 'month') {
  const list = periodRuns(runs, today, period);
  const before = inRange(runs, previousRange(today, period));
  if (!list.length || !before.length) return null;
  const cur = summarize(list);
  const prev = summarize(before);
  if (!(prev.meters > 0)) return null;
  return {
    kmPct: Math.round(((cur.meters - prev.meters) / prev.meters) * 100),
    paceDelta: cur.pace !== null && prev.pace !== null ? cur.pace - prev.pace : null,
  };
}
