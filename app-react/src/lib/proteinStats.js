import { parseLocalDate, toDateStr } from './utils';

// Série diária contínua dos últimos `days` dias até `endDate` (inclusive),
// com 0 nos dias sem registro.
export function buildProteinSeries(logs, endDate, days) {
  const byDate = new Map((logs || []).map(l => [l.log_date, Number(l.amount_g) || 0]));
  const end = parseLocalDate(endDate);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const date = toDateStr(d);
    out.push({ date, g: byDate.get(date) ?? 0 });
  }
  return out;
}

// series: saída de buildProteinSeries, terminando em hoje. Hoje ainda está em
// andamento, então não quebra a sequência nem puxa a média pra baixo — só
// conta se já bateu a meta.
export function proteinStats(series, goalG) {
  if (!series.length) return { avg7: 0, streak: 0, bestG: 0, daysHit: 0 };
  const today = series[series.length - 1];
  const past = series.slice(0, -1);

  const last7 = past.slice(-7);
  const avg7 = last7.length ? Math.round(last7.reduce((s, d) => s + d.g, 0) / last7.length) : 0;

  let streak = 0;
  for (let i = past.length - 1; i >= 0 && past[i].g >= goalG; i--) streak++;
  if (today.g >= goalG) streak++;

  return {
    avg7,
    streak,
    bestG: Math.max(...series.map(d => d.g)),
    daysHit: series.filter(d => d.g >= goalG).length,
  };
}
