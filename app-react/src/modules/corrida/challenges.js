import { t, lang } from '../../lib/i18n';
import { mondayOf } from './program';

// Desafios do mês do EAFIT Run, calculados das próprias corridas (sem banco):
// cada desafio tem degraus; o atual é o primeiro ainda não batido. Corridas
// privadas contam — o desafio é seu.
//   km     soma de km no mês
//   runs   número de corridas no mês
//   long   maior corrida do mês (km)
//   week   corridas nesta semana (segunda a domingo)

const TIERS = {
  km: [25, 50, 100, 150],
  runs: [4, 8, 12, 20],
  long: [5, 10, 15, 21.1],
  week: [3],
};

const ICON = { km: '🛣️', runs: '👟', long: '🏔️', week: '📆' };

function title(kind, goal) {
  const g = lang === 'en' ? String(goal) : String(goal).replace('.', ',');
  if (kind === 'km') return t('Corra {v1} km no mês', { v1: g });
  if (kind === 'runs') return t('{v1} corridas no mês', { v1: g });
  if (kind === 'long') return t('Uma corrida de {v1} km', { v1: g });
  return t('{v1} corridas nesta semana', { v1: g });
}

// [{ kind, icon, title, goal, value, done, tierDone, tiers }] para o mês de `today`.
export function monthlyChallenges(runs, today) {
  const month = today.slice(0, 7);
  const monday = mondayOf(today);
  const inMonth = runs.filter(r => (r.run_date || '').startsWith(month));
  const values = {
    km: inMonth.reduce((s, r) => s + r.distance_m, 0) / 1000,
    runs: inMonth.length,
    long: inMonth.reduce((m, r) => Math.max(m, r.distance_m), 0) / 1000,
    week: runs.filter(r => r.run_date >= monday && r.run_date <= today).length,
  };
  return Object.entries(TIERS).map(([kind, tiers]) => {
    const value = Math.round(values[kind] * 10) / 10;
    const tierDone = tiers.filter(g => value >= g).length;
    const goal = tiers[Math.min(tierDone, tiers.length - 1)];
    return {
      kind, icon: ICON[kind], title: title(kind, goal), goal, value,
      done: tierDone === tiers.length, tierDone, tiers: tiers.length,
    };
  });
}

// Fração do desafio (0 a 1) para a barra.
export const challengeProgress = c => Math.max(0, Math.min(1, c.goal ? c.value / c.goal : 0));

// ---- Medalhas: cada nível de desafio batido num mês -----------------------

const MEDAL_KINDS = ['km', 'runs', 'long'];

const lastDayOf = month => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m, 0);
  return `${month}-${String(d.getDate()).padStart(2, '0')}`;
};

// [{ month, kind, icon, goal, title }] do mais recente ao mais antigo; o mês
// atual entra com o que já foi batido até hoje.
export function monthMedals(runs, today) {
  const months = [...new Set(runs.map(r => (r.run_date || '').slice(0, 7)).filter(Boolean))].sort().reverse();
  const out = [];
  for (const month of months) {
    const end = month === today.slice(0, 7) ? today : lastDayOf(month);
    if (end > today) continue;
    for (const c of monthlyChallenges(runs, end)) {
      if (!MEDAL_KINDS.includes(c.kind)) continue;
      TIERS[c.kind].slice(0, c.tierDone).forEach(goal => out.push({ month, kind: c.kind, icon: ICON[c.kind], goal, title: title(c.kind, goal) }));
    }
  }
  return out;
}

// Medalhas que a corrida nova acabou de dar (comparando com antes dela).
export function newMedals(beforeRuns, afterRuns, today) {
  const key = m => `${m.month}:${m.kind}:${m.goal}`;
  const had = new Set(monthMedals(beforeRuns, today).map(key));
  return monthMedals(afterRuns, today).filter(m => !had.has(key(m)));
}

// ---- Resumo da semana ---------------------------------------------------------

const shift = (dateStr, days) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

// Semana passada (segunda a domingo) e a anterior: { meters, runs, seconds,
// prevMeters, change } (change em % sobre a anterior; null sem base).
export function lastWeekSummary(runs, today) {
  const monday = mondayOf(today);
  const lastMon = shift(monday, -7);
  const prevMon = shift(monday, -14);
  const sum = (from, to) => runs.filter(r => r.run_date >= from && r.run_date < to);
  const last = sum(lastMon, monday);
  const prev = sum(prevMon, lastMon);
  const meters = last.reduce((s, r) => s + r.distance_m, 0);
  const prevMeters = prev.reduce((s, r) => s + r.distance_m, 0);
  return {
    start: lastMon,
    meters,
    runs: last.length,
    seconds: last.reduce((s, r) => s + r.duration_s, 0),
    prevMeters,
    change: prevMeters > 0 ? Math.round(((meters - prevMeters) / prevMeters) * 100) : null,
  };
}
