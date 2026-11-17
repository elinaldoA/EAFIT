import { t } from '../../lib/i18n';
import { SESSION_TITLE } from './program';

// Filtros da lista de corridas do histórico (só a lista: os totais, recordes e
// gráficos continuam contando todas as corridas).

export const PERIODS = [
  { key: 'tudo', label: () => t('Tudo') },
  { key: '30', label: () => t('30 dias'), days: 30 },
  { key: '90', label: () => t('90 dias'), days: 90 },
  { key: 'ano', label: () => t('Este ano') },
];

const pad = n => String(n).padStart(2, '0');

// Data (YYYY-MM-DD) de `days` dias antes de `today`.
export function daysBefore(today, days) {
  const [y, m, d] = today.split('-').map(Number);
  const dt = new Date(y, m - 1, d - days);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

// Primeiro dia incluído pelo período, ou null para "tudo".
export function periodStart(period, today) {
  if (period === 'ano') return `${today.slice(0, 4)}-01-01`;
  const p = PERIODS.find(x => x.key === period);
  return p?.days ? daysBefore(today, p.days) : null;
}

// Tipos de corrida que existem na lista, na ordem em que aparecem em SESSION_TITLE.
export function kindsIn(runs) {
  const present = new Set(runs.map(r => r.kind || 'livre'));
  return Object.keys(SESSION_TITLE).filter(k => present.has(k));
}

export function filterRuns(runs, { period = 'tudo', kind = null } = {}, today) {
  const from = periodStart(period, today);
  return runs.filter(r => (!from || r.run_date >= from) && (!kind || (r.kind || 'livre') === kind));
}
