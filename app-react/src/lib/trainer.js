import { db } from './supabase';
import { calcStreak } from './utils';
import { addDays } from './pause';
import { measurementDeltas } from './bodyMeasurements';
import { buildCheckinInsights } from './checkin';

const ERRORS = {
  invalid_code: 'Código não encontrado. Confira com o seu personal.',
  self_link: 'Você não pode se vincular a si mesmo.',
  already_linked: 'Você já está vinculado a um personal. Encerre o vínculo atual antes de entrar em outro.',
  not_authorized: 'Sem permissão para essa ação.',
};

export function friendlyTrainerError(err) {
  const msg = String(err?.message || '');
  const key = Object.keys(ERRORS).find(k => msg.includes(k));
  return key ? ERRORS[key] : 'Não foi possível concluir. Tente de novo.';
}

export function normalizeTrainerCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

// Situação do aluno pro personal priorizar a atenção.
//  pausado: em modo pausa · novo: ainda não treinou · ok: treinou nos últimos 3
//  dias · atencao: 4 a 7 dias parado · risco: mais de 7 dias parado.
export function clientAttention(client, today) {
  if (client.paused) return { level: 'pausado', label: 'Em pausa', days: null };
  if (!client.last_day) return { level: 'novo', label: 'Ainda não treinou', days: null };
  const days = daysBetween(client.last_day, today);
  if (days <= 3) return { level: 'ok', label: days === 0 ? 'Treinou hoje' : days === 1 ? 'Treinou ontem' : `Treinou há ${days} dias`, days };
  if (days <= 7) return { level: 'atencao', label: `Parado há ${days} dias`, days };
  return { level: 'risco', label: `Sumido há ${days} dias`, days };
}

const ORDER = { risco: 0, atencao: 1, novo: 2, ok: 3, pausado: 4 };

// Quem precisa de atenção primeiro; empate pelo nome.
export function sortClients(clients, today) {
  return [...clients]
    .map(c => ({ c, a: clientAttention(c, today) }))
    .sort((x, y) => ORDER[x.a.level] - ORDER[y.a.level] || String(x.c.name).localeCompare(String(y.c.name), 'pt-BR'))
    .map(x => x.c);
}

// Números de topo da ficha do aluno, a partir do jsonb de trainer_client_detail.
export function summarizeClient(detail, today) {
  const days = detail.training_days || [];
  const since7 = addDays(today, -6);
  const since30 = addDays(today, -29);
  const weights = (detail.weights || []).map(w => ({ date: w.d, value: Number(w.v) })).filter(w => Number.isFinite(w.value));
  const weightDelta = weights.length >= 2 ? Math.round((weights[weights.length - 1].value - weights[0].value) * 10) / 10 : null;
  const rows = (detail.measurements || []).map(m => ({
    measured_on: m.d,
    ...Object.fromEntries(['cintura', 'quadril', 'peito', 'braco', 'coxa'].map(k => [k, m[k] === null || m[k] === undefined ? null : Number(m[k])])),
  }));
  return {
    last7: days.filter(d => d >= since7).length,
    last30: days.filter(d => d >= since30).length,
    total120: days.length,
    streak: calcStreak(days, [], today),
    lastDay: days.length ? days[days.length - 1] : null,
    weights,
    weightDelta,
    measureDeltas: measurementDeltas(rows),
    checkins: buildCheckinInsights((detail.checkins || []).map(k => ({ checkin_date: k.d, energy: k.energy, sleep: k.sleep, mood: k.mood })), days),
  };
}

// ---- RPCs ------------------------------------------------------------------
export async function fetchIsTrainer() {
  const { data, error } = await db.rpc('is_trainer');
  if (error) throw error;
  return !!data;
}

export async function fetchTrainerCode() {
  const { data, error } = await db.rpc('trainer_my_code');
  if (error) throw error;
  return data || '';
}

export async function fetchClients() {
  const { data, error } = await db.rpc('trainer_clients_overview');
  if (error) throw error;
  return (data || []).map(r => ({
    id: r.cl_id, name: r.cl_name, email: r.cl_email, since: r.cl_since, last_day: r.cl_last_day,
    days7: r.cl_days_7, days30: r.cl_days_30, paused: !!r.cl_paused, goal: r.cl_goal, level: r.cl_level,
  }));
}

export async function fetchClientDetail(clientId) {
  const { data, error } = await db.rpc('trainer_client_detail', { p_client: clientId });
  if (error) throw error;
  return data;
}

export async function removeClient(clientId) {
  const { error } = await db.rpc('trainer_remove_client', { p_client: clientId });
  if (error) throw error;
}

export async function linkTrainer(code) {
  const { data, error } = await db.rpc('link_trainer', { p_code: code });
  if (error) throw error;
  return data;
}

export async function unlinkTrainer() {
  const { error } = await db.rpc('unlink_trainer');
  if (error) throw error;
}

export async function fetchMyTrainer() {
  const { data, error } = await db.rpc('my_trainer');
  if (error) throw error;
  const row = (data || [])[0];
  return row ? { name: row.tc_name, since: row.tc_since } : null;
}
