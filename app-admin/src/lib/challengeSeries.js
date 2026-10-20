import { db } from './supabase';

// Desafios recorrentes (Comunidade → Desafios). SQL em
// supabase/migrations/20261128170000_challenge_series.sql: o cron diário cria a
// edição de cada semana/mês 3 dias antes de começar.

export const CADENCE_LABELS = { semanal: 'Toda semana (seg a dom)', mensal: 'Todo mês' };
export const SERIES_TITLE_MAX = 35;

export function validateSeries({ title, cadence, minDays }) {
  const t = String(title || '').trim();
  if (t.length < 3 || t.length > SERIES_TITLE_MAX) return { ok: false, error: `O nome precisa ter de 3 a ${SERIES_TITLE_MAX} caracteres.` };
  if (!CADENCE_LABELS[cadence]) return { ok: false, error: 'Escolha a frequência.' };
  const n = Number(minDays);
  const max = cadence === 'semanal' ? 7 : 31;
  if (!Number.isInteger(n) || n < 1 || n > max) return { ok: false, error: `A meta precisa ser de 1 a ${max} dias.` };
  return { ok: true, value: { title: t, cadence, min_days: n } };
}

const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);

export function mapEdition(r) {
  const members = Number(r.sr_members) || 0;
  const trained = Number(r.sr_trained) || 0;
  const completed = Number(r.sr_completed) || 0;
  const returning = Number(r.sr_returning) || 0;
  return {
    id: r.sr_challenge, title: r.sr_title, code: r.sr_code, start: r.sr_start, end: r.sr_end,
    members, trained, completed, returning, avgDays: r.sr_avg_days == null ? null : Number(r.sr_avg_days),
    trainedPct: pct(trained, members), completedPct: pct(completed, members), returningPct: pct(returning, members),
  };
}

// Variação de participantes da edição mais recente já começada para a anterior.
export function seriesTrend(editions, today) {
  const started = editions.filter(e => e.start <= today);
  if (started.length < 2) return null;
  const [cur, prev] = started;
  return { current: cur.members, previous: prev.members, diff: cur.members - prev.members };
}

export async function fetchSeries() {
  const { data, error } = await db.from('challenge_series').select('id, title, cadence, min_days, active, created_at').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createSeries(input, adminId) {
  const check = validateSeries(input);
  if (!check.ok) throw new Error(check.error);
  const { error } = await db.from('challenge_series').insert({ ...check.value, created_by: adminId });
  if (error) throw error;
  return spawnNow();
}

export async function setSeriesActive(id, active) {
  const { error } = await db.from('challenge_series').update({ active }).eq('id', id);
  if (error) throw error;
}

export async function spawnNow() {
  const { data, error } = await db.rpc('admin_spawn_series_challenges');
  if (error) throw error;
  return Number(data) || 0;
}

export async function fetchSeriesReport(id) {
  const { data, error } = await db.rpc('admin_series_report', { p_series: id });
  if (error) throw error;
  return (data || []).map(mapEdition);
}
