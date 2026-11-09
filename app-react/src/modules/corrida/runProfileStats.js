import { mondayOf, GOAL_LABEL, programFromMetadata, programToday } from './program';
import { addDays, pausedDaySet } from '../../lib/pause';
import { t } from '../../lib/i18n';

// Dados do Perfil de quem está no módulo de corrida: o resumo do topo (km da
// semana, sequência de semanas e km no total), a meta semanal de km e o
// resumo do programa. Nada daqui lê o banco: recebe as corridas já carregadas.

export const MAX_WEEKLY_KM = 300;

// Meta de km por semana: vazio = sem meta; senão de 1 a 300 km.
export function parseWeeklyKm(value) {
  const text = String(value ?? '').trim();
  if (!text) return { km: null };
  const km = Number(text.replace(',', '.'));
  if (!Number.isFinite(km) || km < 1 || km > MAX_WEEKLY_KM) return { error: true };
  return { km: Math.round(km * 10) / 10 };
}

// Metas de km do mês e do ano, mesmo formato da semanal (vazio = sem meta).
export const MAX_MONTHLY_KM = 1500;
export const MAX_YEARLY_KM = 20000;

export function parseKmGoal(value, max) {
  const text = String(value ?? '').trim();
  if (!text) return { km: null };
  const km = Number(text.replace(',', '.'));
  if (!Number.isFinite(km) || km < 1 || km > max) return { error: true };
  return { km: Math.round(km * 10) / 10 };
}

// As três metas guardadas na conta: { week, month, year } (número ou null).
export function kmGoals(meta) {
  return {
    week: parseKmGoal(meta?.runWeeklyKm, MAX_WEEKLY_KM).km ?? null,
    month: parseKmGoal(meta?.runMonthlyKm, MAX_MONTHLY_KM).km ?? null,
    year: parseKmGoal(meta?.runYearlyKm, MAX_YEARLY_KM).km ?? null,
  };
}

// A meta guardada na conta (número ou null).
export function weeklyKmGoal(meta) {
  const { km } = parseWeeklyKm(meta?.runWeeklyKm);
  return km ?? null;
}

// Semana (segunda a domingo) inteira dentro do modo pausa: não quebra a sequência.
function weekPaused(weekStart, paused) {
  for (let i = 0; i < 7; i++) if (!paused.has(addDays(weekStart, i))) return false;
  return true;
}

// { weekMeters, totalMeters, streakWeeks }. Sequência = semanas seguidas com
// pelo menos uma corrida, contando de agora para trás; a semana atual ainda sem
// corrida não quebra a sequência (a semana não acabou), e semana inteira em
// modo pausa é pulada sem somar.
export function runProfileStats(runs, today, pauses = []) {
  const monday = mondayOf(today);
  const weeks = new Set(runs.map(r => mondayOf(r.run_date)));
  const paused = pausedDaySet(pauses);
  let weekMeters = 0;
  let totalMeters = 0;
  for (const r of runs) {
    totalMeters += r.distance_m || 0;
    if (r.run_date >= monday && r.run_date <= today) weekMeters += r.distance_m || 0;
  }
  let streakWeeks = 0;
  let cursor = weeks.has(monday) ? monday : addDays(monday, -7);
  for (let i = 0; i < 520; i++) {
    if (weeks.has(cursor)) streakWeeks++;
    else if (!weekPaused(cursor, paused)) break;
    cursor = addDays(cursor, -7);
  }
  return { weekMeters, totalMeters, streakWeeks };
}

// "10K · semana 4 de 10", "Programa concluído" ou o convite para montar um.
export function programSummary(meta, today) {
  const program = programFromMetadata(meta);
  if (!program) return t('Sem programa: monte um de 5K, 10K ou meia maratona');
  const where = programToday(program, today);
  if (where.maintenance) return where.finished ? t('Programa concluído 🎉') : GOAL_LABEL[program.goal];
  return t('{v1} · semana {v2} de {v3}', { v1: GOAL_LABEL[program.goal], v2: where.week, v3: where.weeks });
}
