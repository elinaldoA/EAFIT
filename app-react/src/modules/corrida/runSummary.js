import { paceSeconds } from './runs';

// Resumo do mês para o cartão dos stories: só números, sem percurso (o mapa de
// cada corrida não vai para fora do app neste cartão).

// Corridas do mês de `today` (YYYY-MM-DD), até hoje.
export function monthRuns(runs, today) {
  const month = today.slice(0, 7);
  return runs.filter(r => r.run_date.startsWith(month) && r.run_date <= today);
}

// null sem corridas no mês.
export function monthSummary(runs, today) {
  const month = today.slice(0, 7);
  const list = monthRuns(runs, today);
  if (!list.length) return null;
  const meters = list.reduce((s, r) => s + r.distance_m, 0);
  const seconds = list.reduce((s, r) => s + r.duration_s, 0);
  return {
    month,
    count: list.length,
    meters,
    seconds,
    pace: paceSeconds(seconds, meters), // null abaixo de 1 km no mês
    longestM: Math.max(...list.map(r => r.distance_m)),
  };
}
