import { todayDate } from '../data/treinoData';
import { addDays } from './pause';
import { parseLocalDate } from './utils';
import { estimateOneRepMax } from './records';

// Metas de carga ("supino 100 kg até dezembro"): ficam no user_metadata
// (strengthGoals), como a meta semanal, para valerem em qualquer aparelho.
// O progresso é medido pelo 1RM estimado (Epley) de cada sessão: assim uma
// série de 90 kg × 5 já mostra o quanto falta para 100 kg × 1. A meta só conta
// como batida com a carga de verdade na barra (série concluída ≥ alvo).

export const MAX_GOALS = 3;
const WINDOW_DAYS = 56; // projeção pelo ritmo das últimas 8 semanas
const MIN_SESSIONS = 3;
const MIN_SPAN_DAYS = 10;
const DAY_MS = 86400000;

const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

// [{ id, exercise, target, by, created, achieved? }] — descarta o que vier torto.
export function readGoals(user) {
  const raw = user?.user_metadata?.strengthGoals;
  if (!Array.isArray(raw)) return [];
  return raw.filter(g => g && typeof g.exercise === 'string' && g.exercise
    && Number(g.target) > 0 && isDate(g.by) && typeof g.id === 'string');
}

export function goalFor(user, exercise) {
  return readGoals(user).find(g => g.exercise === exercise && !g.achieved) || null;
}

export function newGoal(exercise, target, by, today = todayDate()) {
  return { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, exercise, target: Number(target), by, created: today };
}

// Sugestão de alvo: 10% acima do máximo estimado atual, em múltiplos de 2,5.
export function suggestTarget(currentMax) {
  if (!(currentMax > 0)) return '';
  return Math.ceil((currentMax * 1.1) / 2.5) * 2.5;
}

function daysBetween(a, b) {
  return Math.round((parseLocalDate(b) - parseLocalDate(a)) / DAY_MS);
}

// sets: [{ carga, reps, workout_date }] → melhor de cada sessão, por data:
// [{ date, e1rm, carga }] (carga = a maior levantada no dia).
export function sessionBests(sets) {
  const byDate = new Map();
  (sets || []).forEach(s => {
    const carga = parseFloat(s.carga);
    const e1rm = estimateOneRepMax(s.carga, s.reps);
    if (!Number.isFinite(carga) || e1rm === null || !s.workout_date) return;
    const prev = byDate.get(s.workout_date) || { date: s.workout_date, e1rm: 0, carga: 0 };
    byDate.set(s.workout_date, { date: s.workout_date, e1rm: Math.max(prev.e1rm, e1rm), carga: Math.max(prev.carga, carga) });
  });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// Reta de mínimos quadrados (kg por dia) sobre [{ x: dias, y: kg }].
function slopePerDay(points) {
  const n = points.length;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  const den = points.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  if (!den) return 0;
  return points.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / den;
}

// Situação da meta a partir das sessões (sessionBests). Devolve:
//   status: 'achieved' | 'on_track' | 'behind' | 'stalled' | 'no_data' | 'expired'
//   current: 1RM estimado agora (melhor das 3 últimas sessões)
//   best: maior carga levantada; perWeek: ritmo atual (kg/semana)
//   eta: data prevista no ritmo atual; needPerWeek: ritmo para chegar no prazo
//   pct: 0–100 do caminho entre o ponto de partida e o alvo
export function projectGoal(goal, sessions, today = todayDate()) {
  const best = sessions.reduce((a, s) => Math.max(a, s.carga), 0);
  const recent = sessions.slice(-3);
  const current = recent.length ? Math.max(...recent.map(s => s.e1rm)) : 0;
  const before = sessions.filter(s => s.date <= goal.created);
  const start = before.length ? Math.max(...before.slice(-3).map(s => s.e1rm)) : (sessions[0]?.e1rm || 0);
  const span = goal.target - start;
  const pct = span > 0 ? Math.max(0, Math.min(100, Math.round(((current - start) / span) * 100))) : (current >= goal.target ? 100 : 0);
  const daysLeft = daysBetween(today, goal.by);
  const base = { best, current, start, pct, daysLeft, perWeek: null, eta: null, needPerWeek: null };

  if (goal.achieved || best >= goal.target) return { ...base, pct: 100, status: 'achieved' };
  if (daysLeft < 0) return { ...base, status: 'expired' };
  if (daysLeft > 0) base.needPerWeek = Math.round(((goal.target - current) / daysLeft) * 7 * 10) / 10;

  const since = addDays(today, -WINDOW_DAYS);
  const window = sessions.filter(s => s.date >= since);
  if (window.length < MIN_SESSIONS || daysBetween(window[0].date, window[window.length - 1].date) < MIN_SPAN_DAYS) {
    return { ...base, status: 'no_data' };
  }
  const perDay = slopePerDay(window.map(s => ({ x: daysBetween(since, s.date), y: s.e1rm })));
  const perWeek = Math.round(perDay * 7 * 10) / 10;
  if (perDay <= 0) return { ...base, perWeek, status: 'stalled' };
  const eta = addDays(today, Math.ceil((goal.target - current) / perDay));
  return { ...base, perWeek, eta, status: eta <= goal.by ? 'on_track' : 'behind' };
}
