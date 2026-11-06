import { t } from '../../lib/i18n';
import { parseLocalDate } from '../../lib/utils';
import { mondayOf, goalWeeks } from './program';

// Meta por prova: a pessoa marca uma prova (nome, data e distância) e o app
// mostra a contagem regressiva, o quanto ela já está preparada e quando
// começar o programa para chegar bem. Fica na conta (user_metadata.runRace
// = { name, date, km }); nada é salvo por semana, tudo sai das corridas.

export const RACE_DISTANCES = [
  { km: 5, label: '5K' },
  { km: 10, label: '10K' },
  { km: 21.1, label: t('Meia maratona') },
  { km: 42.195, label: t('Maratona') },
];

export const RACE_NAME_MAX = 60;
const DAY_MS = 86400000;

const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');

export function raceFromMetadata(md) {
  const r = md?.runRace;
  const km = Number(r?.km);
  if (!r || !isDate(r.date) || !(km >= 1 && km <= 250)) return null;
  return { name: String(r.name || '').trim().slice(0, RACE_NAME_MAX), date: r.date, km };
}

// Valida o que a pessoa digitou; devolve { race } ou { error }.
export function buildRace({ name = '', date, km }, today) {
  const dist = Number(String(km).replace(',', '.'));
  if (!isDate(date)) return { error: t('Escolha a data da prova.') };
  if (date < today) return { error: t('A data da prova já passou.') };
  if (!(dist >= 1 && dist <= 250)) return { error: t('A distância precisa ficar entre 1 e 250 km.') };
  return { race: { name: String(name).trim().slice(0, RACE_NAME_MAX), date, km: Math.round(dist * 100) / 100 } };
}

export const daysUntil = (date, today) => Math.round((parseLocalDate(date) - parseLocalDate(today)) / DAY_MS);

// Objetivo do programa que prepara para essa distância (null = nenhum cabe).
export function programGoalFor(km) {
  if (km >= 4.5 && km <= 7) return '5k';
  if (km >= 9 && km <= 12) return '10k';
  if (km >= 20 && km <= 22) return 'meia';
  return null;
}

// Segunda-feira em que o programa precisa começar para a semana da prova ser a
// última. { start, late, weeks }: late = não dá mais tempo de fazer o programa
// inteiro antes da prova (o início cai nesta semana e a tela avisa).
export function suggestedStart(race, goal, nivel, today) {
  const weeks = goalWeeks(goal, nivel);
  if (!weeks) return null;
  const raceMonday = parseLocalDate(mondayOf(race.date));
  const start = new Date(raceMonday.getTime() - (weeks - 1) * 7 * DAY_MS);
  const pad = n => String(n).padStart(2, '0');
  const ideal = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  const thisMonday = mondayOf(today);
  return ideal >= thisMonday ? { start: ideal, late: false, weeks } : { start: thisMonday, late: true, weeks };
}

// Preparo: maior corrida e média semanal das últimas 4 semanas, contra a prova.
export function raceReadiness(runs, race, today) {
  const since = parseLocalDate(today);
  since.setDate(since.getDate() - 28);
  const pad = n => String(n).padStart(2, '0');
  const from = `${since.getFullYear()}-${pad(since.getMonth() + 1)}-${pad(since.getDate())}`;
  const recent = (runs || []).filter(r => r.run_date >= from && r.run_date <= today);
  const longestKm = recent.reduce((m, r) => Math.max(m, (r.distance_m || 0) / 1000), 0);
  const totalKm = recent.reduce((s, r) => s + (r.distance_m || 0) / 1000, 0);
  // Para a maratona, 32 km já é o treino mais longo que se pede; nas outras, a própria prova.
  const target = race.km > 30 ? 32 : race.km;
  return {
    longestKm,
    weeklyKm: totalKm / 4,
    pct: Math.max(0, Math.min(1, target ? longestKm / target : 0)),
    target,
  };
}

// 'done' (já passou) | 'today' | 'week' (nesta semana) | 'soon' (até 14 dias) | 'far'
export function raceStage(race, today) {
  const d = daysUntil(race.date, today);
  if (d < 0) return 'done';
  if (d === 0) return 'today';
  if (mondayOf(race.date) === mondayOf(today)) return 'week';
  return d <= 14 ? 'soon' : 'far';
}
