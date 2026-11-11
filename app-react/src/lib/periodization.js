import { t } from './i18n';
import { parseLocalDate } from './utils';

// Periodização simples por semana de um plano com data de início:
//  - meta semanal: +N kg sobre a última carga registrada do exercício;
//  - semana leve (deload) a cada N semanas: séries reduzidas, sem subir carga.
// Sem start_date (plano sem ciclo) nada disso se aplica.
export const STEP_CHOICES = [1, 2.5, 5];
export const DELOAD_CHOICES = [3, 4, 5, 6];
const DELOAD_VOLUME = 0.6;
const DAY_MS = 86400000;

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// 1 = primeira semana do ciclo (7 dias a partir do início).
export function weekOfCycle(startDate, today = new Date()) {
  if (!startDate) return null;
  const start = startOfDay(parseLocalDate(startDate));
  const days = Math.round((startOfDay(today) - start) / DAY_MS);
  return days < 0 ? 1 : Math.floor(days / 7) + 1;
}

export function isDeloadWeek(week, deloadEvery) {
  return !!deloadEvery && deloadEvery >= 2 && !!week && week % deloadEvery === 0;
}

// Resumo da semana atual; null quando o plano não usa periodização.
export function periodizationInfo({ startDate, durationWeeks = null, step = null, deloadEvery = null } = {}, today = new Date()) {
  const stepN = Number(step) > 0 ? Number(step) : null;
  const deloadN = Number(deloadEvery) >= 2 ? Number(deloadEvery) : null;
  if (!startDate || (!stepN && !deloadN)) return null;
  const week = weekOfCycle(startDate, today);
  return {
    week,
    total: durationWeeks ? Number(durationWeeks) : null,
    step: stepN,
    deloadEvery: deloadN,
    deload: isDeloadWeek(week, deloadN),
  };
}

export function deloadSeries(series) {
  const n = parseInt(series, 10);
  if (!n || n < 2) return series;
  return String(Math.max(1, Math.ceil(n * DELOAD_VOLUME)));
}

// Na semana leve reduz as séries dos exercícios de força (pós-treino, cardio e
// itens por tempo ficam como estão). Marca `deload` para a tela avisar.
export function applyPeriodization(days, info) {
  if (!info?.deload) return days;
  return days.map(d => ({
    ...d,
    exercicios: (d.exercicios || []).map(ex => {
      const series = deloadSeries(ex.series);
      return series === ex.series ? ex : { ...ex, series, seriesPlanned: ex.series, deload: true };
    }),
  }));
}

export function weekLabel(info) {
  if (!info) return '';
  return info.total ? t('Semana {week} de {total}', { week: info.week, total: info.total }) : t('Semana {week}', { week: info.week });
}

export function stepLabel(step) {
  return t('+{step} kg por semana', { step: String(step).replace('.', ',') });
}
