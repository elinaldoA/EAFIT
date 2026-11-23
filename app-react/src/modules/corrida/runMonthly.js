import { t } from '../../lib/i18n';

// Selos mensais: desafios que se renovam a cada mês (km no mês, corridas no mês e
// corrida longa). Diferente das conquistas (runReadings.achievements), que são
// para a vida toda, estes zeram no dia 1 e ficam guardados na "estante" de cada mês.

const KM_STEPS = [[50, '🥉'], [100, '🥈'], [150, '🥇'], [200, '💎']];
const COUNT_STEPS = [[8, '📅'], [12, '🔁'], [20, '⚡']];
const LONG_STEPS = [[10, '🔟'], [21, '🏅']];

// Selos de um conjunto de corridas do mesmo mês: [{ id, icon, title, have, need, unlocked, progress }].
export function monthBadges(list) {
  const km = list.reduce((s, r) => s + (r.distance_m || 0), 0) / 1000;
  const count = list.length;
  const longest = list.reduce((m, r) => Math.max(m, (r.distance_m || 0) / 1000), 0);
  const out = [];
  const add = (id, icon, title, have, need) => out.push({ id, icon, title, have, need, unlocked: have >= need, progress: Math.min(1, have / need) });
  for (const [n, icon] of KM_STEPS) add(`km-${n}`, icon, t('{v1} km no mês', { v1: n }), km, n);
  for (const [n, icon] of COUNT_STEPS) add(`count-${n}`, icon, t('{v1} corridas no mês', { v1: n }), count, n);
  for (const [n, icon] of LONG_STEPS) add(`long-${n}`, icon, t('Uma corrida de {v1} km', { v1: n }), longest, n);
  return out;
}

const monthKey = d => (d || '').slice(0, 7);

// { current, shelf }: os selos do mês de `today` (com o progresso) e a estante dos
// meses já fechados com pelo menos 1 selo, do mais recente ao mais antigo (até `months`).
export function monthlyBadges(runs, today, months = 12) {
  const byMonth = new Map();
  for (const r of runs) {
    if (!r.run_date || r.run_date > today) continue;
    const key = monthKey(r.run_date);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(r);
  }
  const now = monthKey(today);
  const current = monthBadges(byMonth.get(now) || []);
  const shelf = [...byMonth.keys()]
    .filter(k => k < now)
    .sort()
    .reverse()
    .slice(0, months)
    .map(month => ({ month, badges: monthBadges(byMonth.get(month)).filter(b => b.unlocked) }))
    .filter(m => m.badges.length);
  return { current, shelf };
}
