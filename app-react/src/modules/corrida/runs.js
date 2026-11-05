import { db } from '../../lib/supabase';
import { parseLocalDate, toDateStr } from '../../lib/utils';
import { mondayOf } from './program';
import { cleanRoute, applyZones } from './route';

import { t, lang } from '../../lib/i18n';
// Corridas do EAFIT Run (tabela public.runs): salvar, listar, apagar e as
// contas de ritmo, totais e recordes. Corrida que não subiu (sem internet no
// fim do treino) fica numa fila no aparelho e sobe na próxima abertura; o
// client_id gerado no aparelho impede que o reenvio duplique.

// Corrida salva: as abas Correr e Corridas recarregam a lista.
export const RUN_SAVED_EVENT = 'eafit:run-saved';

const PENDING_KEY = 'eafit_runs_pending';
const COLUMNS = 'id, client_id, run_date, started_at, title, visibility, duration_s, distance_m, splits, route, kind, program_week, program_day, gps, effort, notes';

// Ritmo só vale a partir de 1 km (abaixo disso o número engana).
const MIN_PACE_M = 1000;

// Distâncias com recorde de tempo, a partir dos splits do GPS.
export const EFFORT_KM = [1, 5, 10, 21];

// ---- Contas ----------------------------------------------------------------

// Segundos por km; null sem distância suficiente.
export function paceSeconds(durationS, meters) {
  if (!(durationS > 0) || !(meters >= MIN_PACE_M)) return null;
  return Math.round(durationS / (meters / 1000));
}

export function formatPace(sec) {
  if (!Number.isFinite(sec)) return '–';
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

// "42:07" ou "1:05:30".
export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

// Separador decimal do idioma do app: "5,23" em português, "5.23" em inglês.
export const decimal = (text, language = lang) => (language === 'en' ? String(text) : String(text).replace('.', ','));

export const formatKm = (meters, digits = 2) => decimal((Math.max(0, meters || 0) / 1000).toFixed(digits));

// Menor tempo (s) em `k` km seguidos dentro dos splits; null se não houver km suficientes.
export function bestEffort(splits, k) {
  if (!Array.isArray(splits) || splits.length < k) return null;
  let sum = 0;
  for (let i = 0; i < k; i++) sum += splits[i];
  let best = sum;
  for (let i = k; i < splits.length; i++) {
    sum += splits[i] - splits[i - k];
    if (sum < best) best = sum;
  }
  return best;
}

// Totais, recordes e km por semana (as últimas `weeks`, da mais antiga à atual).
export function computeRunStats(runs, today, weeks = 8) {
  let totalM = 0;
  let totalS = 0;
  let longestM = 0;
  let bestPace = null;
  const efforts = Object.fromEntries(EFFORT_KM.map(k => [k, null]));
  const byWeek = new Map();
  for (const r of runs) {
    totalM += r.distance_m;
    totalS += r.duration_s;
    if (r.distance_m > longestM) longestM = r.distance_m;
    const p = paceSeconds(r.duration_s, r.distance_m);
    if (p !== null && (bestPace === null || p < bestPace)) bestPace = p;
    for (const k of EFFORT_KM) {
      const e = bestEffort(r.splits, k);
      if (e !== null && (efforts[k] === null || e < efforts[k])) efforts[k] = e;
    }
    const ws = mondayOf(r.run_date);
    byWeek.set(ws, (byWeek.get(ws) || 0) + r.distance_m);
  }
  const current = parseLocalDate(mondayOf(today));
  const list = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(current);
    d.setDate(d.getDate() - i * 7);
    const start = toDateStr(d);
    list.push({ start, meters: byWeek.get(start) || 0 });
  }
  return { count: runs.length, totalM, totalS, longestM, bestPace, efforts, weeks: list };
}

// Recordes que `run` bateu em relação às corridas anteriores. A primeira
// corrida não conta como recorde (não há o que bater).
export function newRecords(previousRuns, run) {
  if (!previousRuns.length) return [];
  const before = computeRunStats(previousRuns, run.run_date, 1);
  const out = [];
  if (run.distance_m > before.longestM) out.push({ kind: 'distance', value: run.distance_m });
  const pace = paceSeconds(run.duration_s, run.distance_m);
  if (pace !== null && before.bestPace !== null && pace < before.bestPace) out.push({ kind: 'pace', value: pace });
  for (const k of EFFORT_KM) {
    const e = bestEffort(run.splits, k);
    if (e !== null && before.efforts[k] !== null && e < before.efforts[k]) out.push({ kind: 'effort', km: k, value: e });
  }
  return out;
}

export function describeRecord(r) {
  if (r.kind === 'distance') return t('maior distância: {v1} km', { v1: formatKm(r.value) });
  if (r.kind === 'pace') return t('melhor ritmo: {v1}/km', { v1: formatPace(r.value) });
  return t('melhor {v1} km: {v2}', { v1: r.km, v2: formatClock(r.value) });
}

// Título automático pela hora do início, como "Corrida da manhã".
export function defaultRunTitle(startedAt) {
  const h = new Date(startedAt).getHours();
  if (h >= 5 && h < 12) return t('Corrida da manhã');
  if (h >= 12 && h < 18) return t('Corrida da tarde');
  if (h >= 18 && h < 23) return t('Corrida da noite');
  return t('Corrida da madrugada');
}

export const runTitle = run => (run?.title && run.title.trim()) || defaultRunTitle(run?.started_at || Date.now());

// ---- Banco -----------------------------------------------------------------

function normalizeRow(r) {
  return {
    ...r,
    duration_s: Number(r.duration_s) || 0,
    distance_m: Number(r.distance_m) || 0,
    splits: Array.isArray(r.splits) ? r.splits.map(Number).filter(n => n > 0) : [],
    route: cleanRoute(r.route),
  };
}

function readPending() {
  try {
    const all = JSON.parse(localStorage.getItem(PENDING_KEY) || '{}');
    return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
  } catch {
    return {};
  }
}

function writePending(all) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(all)); } catch { /* sem storage */ }
}

export const pendingRuns = userId => readPending()[userId] || [];

function setPending(userId, list) {
  const all = readPending();
  if (list.length) all[userId] = list;
  else delete all[userId];
  writePending(all);
}

async function insertRun(userId, run) {
  const { data, error } = await db
    .from('runs')
    .upsert({ ...run, user_id: userId }, { onConflict: 'user_id,client_id' })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return normalizeRow(data);
}

// Salva a corrida; sem conexão, guarda na fila e devolve { pending: true }.
export async function saveRun(userId, run) {
  try {
    return { run: await insertRun(userId, run), pending: false };
  } catch (err) {
    console.error('saveRun:', err);
    setPending(userId, [...pendingRuns(userId).filter(r => r.client_id !== run.client_id), run]);
    return { run: normalizeRow(run), pending: true };
  }
}

// Sobe a fila do aparelho. Devolve quantas subiram.
export async function flushPendingRuns(userId) {
  const list = pendingRuns(userId);
  if (!list.length) return 0;
  const left = [];
  let sent = 0;
  for (const run of list) {
    try { await insertRun(userId, run); sent++; } catch { left.push(run); }
  }
  setPending(userId, left);
  return sent;
}

// Corridas da pessoa (as da fila do aparelho entram também), mais recentes primeiro.
export async function fetchRuns(userId) {
  const { data, error } = await db
    .from('runs')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('run_date', { ascending: false })
    .order('started_at', { ascending: false });
  if (error) throw error;
  const rows = (data || []).map(normalizeRow);
  const ids = new Set(rows.map(r => r.client_id));
  const pending = pendingRuns(userId).filter(r => !ids.has(r.client_id)).map(r => ({ ...normalizeRow(r), pending: true }));
  return [...pending, ...rows].sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''));
}

// ---- Social (amigos) --------------------------------------------------------

// Feed: as minhas corridas e as dos amigos (run_feed), mais recentes primeiro.
export async function fetchRunFeed({ limit = 20, before = null } = {}) {
  const { data, error } = await db.rpc('run_feed', { p_limit: limit, p_before: before });
  if (error) throw error;
  return (data || []).map(r => ({
    id: r.rf_id, name: r.rf_name, isMe: !!r.rf_is_me, started_at: r.rf_started_at, run_date: r.rf_run_date,
    duration_s: Number(r.rf_duration_s) || 0, distance_m: Number(r.rf_distance_m) || 0,
    route: cleanRoute(r.rf_route), kind: r.rf_kind, title: r.rf_title, visibility: r.rf_visibility,
    kudos: Number(r.rf_kudos) || 0, kudoed: !!r.rf_kudoed,
  }));
}

export async function toggleKudos(runId) {
  const { data, error } = await db.rpc('toggle_run_kudos', { p_run: runId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { kudos: Number(row?.rk_kudos) || 0, kudoed: !!row?.rk_kudoed };
}

// Km da semana entre mim e os amigos: [{ name, isMe, meters, runs, rank }].
export async function fetchFriendsWeek() {
  const { data, error } = await db.rpc('run_friends_week');
  if (error) throw error;
  let rank = 0;
  let last = null;
  return (data || []).map((r, i) => {
    const meters = Number(r.rw_meters) || 0;
    if (meters !== last) { rank = i + 1; last = meters; }
    return { name: r.rw_name, isMe: !!r.rw_is_me, meters, runs: Number(r.rw_runs) || 0, rank };
  });
}

export async function deleteRun(userId, run) {
  if (run.pending) {
    setPending(userId, pendingRuns(userId).filter(r => r.client_id !== run.client_id));
    return;
  }
  const { error } = await db.from('runs').delete().eq('id', run.id).eq('user_id', userId);
  if (error) throw error;
}

// Zona de privacidade nova: tira a zona também das corridas já salvas (e das
// que ainda esperam internet no aparelho). Devolve quantas mudaram.
export async function applyZonesToRuns(userId, zones) {
  const list = pendingRuns(userId);
  const fixed = list.map(r => ({ ...r, route: applyZones(r.route, zones) }));
  if (list.length) setPending(userId, fixed);

  const { data, error } = await db.from('runs').select('id, route').eq('user_id', userId);
  if (error) throw error;
  let changed = 0;
  for (const row of data || []) {
    const before = cleanRoute(row.route);
    if (!before.length) continue;
    const after = applyZones(before, zones);
    if (JSON.stringify(after) === JSON.stringify(before)) continue;
    const { error: upErr } = await db.from('runs').update({ route: after }).eq('id', row.id).eq('user_id', userId);
    if (upErr) throw upErr;
    changed++;
  }
  return changed;
}
