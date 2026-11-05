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
