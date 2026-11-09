import { db } from '../../lib/supabase';
import { parseLocalDate, toDateStr } from '../../lib/utils';
import { mondayOf } from './program';
import { cleanRoute, applyZones } from './route';
import { cleanReps } from './intervals';

import { t, lang } from '../../lib/i18n';
// Corridas do EAFIT Run (tabela public.runs): salvar, listar, apagar e as
// contas de ritmo, totais e recordes. Corrida que não subiu (sem internet no
// fim do treino) fica numa fila no aparelho e sobe na próxima abertura; o
// client_id gerado no aparelho impede que o reenvio duplique.

// Corrida salva: as abas Correr e Corridas recarregam a lista.
export const RUN_SAVED_EVENT = 'eafit:run-saved';

const PENDING_KEY = 'eafit_runs_pending';
const COLUMNS = 'id, client_id, run_date, started_at, title, visibility, duration_s, distance_m, splits, route, kind, program_week, program_day, gps, effort, notes, elev_gain_m, cadence, shoe_id';
// intervals vem de uma migration mais nova: sem ela, a coluna falta e o app segue sem os tiros.
const COLUMNS_WITH_INTERVALS = `${COLUMNS}, intervals`;
const missingIntervals = error => !!error && /intervals/i.test(`${error.message || ''} ${error.details || ''}`);

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

// Corrida lançada à mão (esteira, relógio, corrida feita sem o app). date
// "YYYY-MM-DD", time "HH:MM" (hora local do início), km com vírgula ou ponto.
// Devolve { record } no formato de liveRun.finishRun ou { error } com a
// mensagem para a pessoa.
export function manualRun({ date, time, hours = 0, minutes = 0, seconds = 0, km, title = '', treadmill = false, effort = null, notes = '', visibility = 'amigos', shoeId = null }, now = Date.now(), random = Math.random) {
  const num = v => (v === '' || v == null ? 0 : Number(String(v).replace(',', '.')));
  const durationS = Math.round(num(hours) * 3600 + num(minutes) * 60 + num(seconds));
  const dist = num(km);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return { error: t('⚠️ Escolha a data da corrida') };
  if (!/^\d{2}:\d{2}$/.test(String(time || ''))) return { error: t('⚠️ Escolha a hora de início') };
  if (![hours, minutes, seconds].every(v => Number.isFinite(num(v)) && num(v) >= 0)) return { error: t('⚠️ Tempo inválido') };
  if (!(durationS >= 1 && durationS <= 86400)) return { error: t('⚠️ Digite o tempo da corrida (até 24 h)') };
  if (!(Number.isFinite(dist) && dist > 0 && dist <= 500)) return { error: t('⚠️ Distância inválida') };
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const start = new Date(y, mo - 1, d, h, mi);
  if (Number.isNaN(start.getTime()) || start.getMonth() !== mo - 1) return { error: t('⚠️ Escolha a data da corrida') };
  if (start.getTime() + durationS * 1000 > now + 60000) return { error: t('⚠️ A corrida não pode terminar no futuro') };
  const cleanTitle = String(title || '').trim().slice(0, 80);
  return {
    record: {
      client_id: `manual-${now.toString(36)}-${Math.floor(random() * 1e9).toString(36)}`,
      run_date: date,
      started_at: start.toISOString(),
      duration_s: durationS,
      distance_m: Math.round(dist * 1000),
      splits: [],
      kind: 'livre',
      program_week: null,
      program_day: null,
      gps: false,
      route: [],
      effort: Number.isInteger(effort) && effort >= 1 && effort <= 10 ? effort : null,
      notes: String(notes || '').trim().slice(0, 500) || null,
      title: cleanTitle || (treadmill ? t('Corrida na esteira') : defaultRunTitle(start.getTime())),
      visibility: visibility === 'privado' ? 'privado' : 'amigos',
      elev_gain_m: null,
      cadence: null,
      shoe_id: shoeId || null,
    },
  };
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
    elev_gain_m: r.elev_gain_m == null ? null : Number(r.elev_gain_m),
    cadence: r.cadence == null ? null : Number(r.cadence),
    shoe_id: r.shoe_id || null,
    intervals: cleanReps(r.intervals),
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
  // Só manda a coluna nova quando há tiros: corrida comum não depende da migration.
  const { intervals, ...rest } = run;
  const hasIntervals = Array.isArray(intervals) && intervals.length > 0;
  const { data, error } = await db
    .from('runs')
    .upsert({ ...rest, ...(hasIntervals ? { intervals } : {}), user_id: userId }, { onConflict: 'user_id,client_id' })
    .select(hasIntervals ? COLUMNS_WITH_INTERVALS : COLUMNS)
    .single();
  if (hasIntervals && missingIntervals(error)) return insertRun(userId, { ...rest, intervals: null });
  // Tênis apagado enquanto a corrida esperava internet: sobe sem o tênis.
  if (error?.code === '23503' && run.shoe_id) return insertRun(userId, { ...run, shoe_id: null });
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
  const query = columns => db
    .from('runs')
    .select(columns)
    .eq('user_id', userId)
    .order('run_date', { ascending: false })
    .order('started_at', { ascending: false });
  let { data, error } = await query(COLUMNS_WITH_INTERVALS);
  if (missingIntervals(error)) ({ data, error } = await query(COLUMNS));
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
    kudos: Number(r.rf_kudos) || 0, kudoed: !!r.rf_kudoed, comments: Number(r.rf_comments) || 0,
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

// ---- Tênis (tabela public.run_shoes) ----------------------------------------
// Os km de cada tênis saem das corridas com aquele shoe_id, mais initial_m (o
// que já tinha rodado antes do app). A lista fica guardada no aparelho para o
// fim da corrida sem internet ainda mostrar os tênis.

const SHOE_COLUMNS = 'id, name, initial_m, limit_m, retired, created_at';
const SHOES_CACHE_KEY = 'eafit_run_shoes';
const LAST_SHOE_KEY = 'eafit_run_shoe_last';
// Vida útil padrão de um tênis de corrida (km).
export const SHOE_LIMIT_KM = 700;
// A partir dessa fração da vida útil o app avisa.
export const SHOE_WARN = 0.9;

function readShoeCache(userId) {
  try {
    const all = JSON.parse(localStorage.getItem(SHOES_CACHE_KEY) || '{}');
    return Array.isArray(all?.[userId]) ? all[userId] : [];
  } catch {
    return [];
  }
}

function writeShoeCache(userId, list) {
  try {
    const all = JSON.parse(localStorage.getItem(SHOES_CACHE_KEY) || '{}') || {};
    all[userId] = list;
    localStorage.setItem(SHOES_CACHE_KEY, JSON.stringify(all));
  } catch { /* sem storage */ }
}

const normalizeShoe = s => ({
  ...s, initial_m: Number(s.initial_m) || 0, limit_m: Number(s.limit_m) || SHOE_LIMIT_KM * 1000, retired: !!s.retired,
});

// Tênis da pessoa (do mais antigo ao mais novo). Sem internet, os do aparelho.
export async function fetchShoes(userId) {
  try {
    const { data, error } = await db.from('run_shoes').select(SHOE_COLUMNS).eq('user_id', userId).order('created_at', { ascending: true });
    if (error) throw error;
    const list = (data || []).map(normalizeShoe);
    writeShoeCache(userId, list);
    return list;
  } catch (err) {
    console.error('fetchShoes:', err);
    return readShoeCache(userId);
  }
}

export const cachedShoes = userId => readShoeCache(userId);

const kmToM = v => Math.round((Number(String(v ?? '').replace(',', '.')) || 0) * 1000);

// Novo tênis: nome, km já rodados e vida útil (km). Devolve o tênis salvo.
export async function addShoe(userId, { name, initialKm = 0, limitKm = SHOE_LIMIT_KM }) {
  const row = {
    user_id: userId,
    name: String(name || '').trim().slice(0, 60),
    initial_m: Math.min(5000000, Math.max(0, kmToM(initialKm))),
    limit_m: Math.min(5000000, Math.max(50000, kmToM(limitKm) || SHOE_LIMIT_KM * 1000)),
  };
  const { data, error } = await db.from('run_shoes').insert(row).select(SHOE_COLUMNS).single();
  if (error) throw error;
  const shoe = normalizeShoe(data);
  writeShoeCache(userId, [...readShoeCache(userId).filter(s => s.id !== shoe.id), shoe]);
  return shoe;
}

export async function updateShoe(userId, id, patch) {
  const { data, error } = await db.from('run_shoes').update(patch).eq('id', id).eq('user_id', userId).select(SHOE_COLUMNS).single();
  if (error) throw error;
  const shoe = normalizeShoe(data);
  writeShoeCache(userId, readShoeCache(userId).map(s => (s.id === id ? shoe : s)));
  return shoe;
}

export async function deleteShoe(userId, id) {
  const { error } = await db.from('run_shoes').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
  writeShoeCache(userId, readShoeCache(userId).filter(s => s.id !== id));
}

// Metros rodados por tênis: { [id]: metros } (initial_m + corridas).
export function shoeUsage(shoes, runs) {
  const out = Object.fromEntries(shoes.map(s => [s.id, s.initial_m || 0]));
  for (const r of runs) if (r.shoe_id && r.shoe_id in out) out[r.shoe_id] += r.distance_m || 0;
  return out;
}

// 'ok' | 'warn' (perto da vida útil) | 'over' (passou).
export function shoeWear(shoe, meters) {
  if (meters >= shoe.limit_m) return 'over';
  return meters >= shoe.limit_m * SHOE_WARN ? 'warn' : 'ok';
}

// Tênis sugerido para a próxima corrida: o último usado, se ainda está ativo;
// senão o único ativo; senão nenhum.
export function defaultShoeId(shoes) {
  const active = shoes.filter(s => !s.retired);
  let last = null;
  try { last = localStorage.getItem(LAST_SHOE_KEY); } catch { /* sem storage */ }
  if (last && active.some(s => s.id === last)) return last;
  return active.length === 1 ? active[0].id : null;
}

export function rememberShoe(id) {
  try {
    if (id) localStorage.setItem(LAST_SHOE_KEY, id);
    else localStorage.removeItem(LAST_SHOE_KEY);
  } catch { /* sem storage */ }
}

// Aviso depois de salvar a corrida: o tênis acabou de entrar na faixa de troca.
export function shoeWearNotice(shoe, beforeM, addedM) {
  if (!shoe) return null;
  const before = shoeWear(shoe, beforeM);
  const after = shoeWear(shoe, beforeM + addedM);
  if (after === before || after === 'ok') return null;
  return after === 'over'
    ? t('👟 {v1} passou de {v2} km: hora de trocar de tênis', { v1: shoe.name, v2: Math.round(shoe.limit_m / 1000) })
    : t('👟 {v1} está perto do fim da vida útil ({v2} de {v3} km)', { v1: shoe.name, v2: Math.round((beforeM + addedM) / 1000), v3: Math.round(shoe.limit_m / 1000) });
}

// ---- Comentários (run_comments, só pelas funções do banco) -----------------

const toComment = c => ({
  id: c.rc_id, name: c.rc_name, isMe: !!c.rc_is_me, body: c.rc_body, created_at: c.rc_created_at, canDelete: !!c.rc_can_delete,
});

export const COMMENT_MAX = 280;

export async function fetchRunComments(runId) {
  const { data, error } = await db.rpc('run_comments_list', { p_run: runId });
  if (error) throw error;
  return (data || []).map(toComment);
}

export async function addRunComment(runId, body) {
  const { data, error } = await db.rpc('add_run_comment', { p_run: runId, p_body: body });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return toComment(row);
}

export async function deleteRunComment(id) {
  const { error } = await db.rpc('delete_run_comment', { p_id: id });
  if (error) throw error;
}

export async function reportRunComment(id, reason = 'ofensivo') {
  const { error } = await db.rpc('report_run_comment', { p_id: id, p_reason: reason });
  if (error) throw error;
}

// Mensagem para a pessoa a partir do erro do banco.
export function commentError(err) {
  const msg = String(err?.message || '');
  if (msg.includes('blocked_word')) return t('⚠️ O comentário tem uma palavra que não é permitida');
  if (msg.includes('rate_limited')) return t('⚠️ Muitos comentários seguidos: espere um pouco');
  if (msg.includes('blocked')) return t('⚠️ Sua conta não pode comentar no momento');
  if (msg.includes('not_found')) return t('⚠️ Essa corrida não está mais disponível');
  return t('⚠️ Não deu para enviar — tente de novo');
}

// ---- Clubes de corrida ------------------------------------------------------

export const CLUB_NAME_MAX = 40;
export const CLUB_DESC_MAX = 200;
export const CLUB_LIMIT = 5;

const toClub = c => ({
  id: c.rc_id, name: c.rc_name, description: c.rc_description || '', isOwner: !!c.rc_is_owner,
  code: c.rc_code, members: Number(c.rc_members) || 0,
});

const firstRow = data => (Array.isArray(data) ? data[0] : data);

export async function fetchClubs() {
  const { data, error } = await db.rpc('my_run_clubs');
  if (error) throw error;
  return (data || []).map(toClub);
}

export async function createClub(name, description = '') {
  const { data, error } = await db.rpc('create_run_club', { p_name: name, p_description: description });
  if (error) throw error;
  return toClub(firstRow(data));
}

export async function joinClub(code) {
  const { data, error } = await db.rpc('join_run_club', { p_code: code });
  if (error) throw error;
  return toClub(firstRow(data));
}

export async function leaveClub(id) {
  const { error } = await db.rpc('leave_run_club', { p_club: id });
  if (error) throw error;
}

export async function deleteClub(id) {
  const { error } = await db.rpc('delete_run_club', { p_club: id });
  if (error) throw error;
}

// period: 'week' | 'month'. [{ name, isMe, meters, runs, hidden, rank }]
export async function fetchClubRanking(id, period = 'week') {
  const { data, error } = await db.rpc('run_club_ranking', { p_club: id, p_period: period });
  if (error) throw error;
  return rankRows((data || []).map(r => ({
    name: r.cr_name, isMe: !!r.cr_is_me, meters: Number(r.cr_meters) || 0, runs: Number(r.cr_runs) || 0, hidden: !!r.cr_hidden,
  })));
}

// Posição de cada um: empate de km divide a posição; quem ocultou fica sem posição.
export function rankRows(rows) {
  let rank = 0;
  let last = null;
  let seen = 0;
  return rows.map(r => {
    if (r.hidden) return { ...r, rank: null };
    seen += 1;
    if (r.meters !== last) { rank = seen; last = r.meters; }
    return { ...r, rank };
  });
}

export function normalizeClubCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function clubInviteText(club, url) {
  return t('Corre com a gente? 🏃 Entre no clube {name} no EAFIT Run com o código {code} (aba Desafios → Clubes). {url}', { name: club.name, code: club.code, url });
}

// Mensagem para a pessoa a partir do erro do banco.
export function clubError(err) {
  const msg = String(err?.message || '');
  if (msg.includes('invalid_code')) return t('Clube não encontrado. Confira o código.');
  if (msg.includes('too_many_clubs')) return t('Você já está em {v1} clubes. Saia de um para entrar em outro.', { v1: CLUB_LIMIT });
  if (msg.includes('club_full')) return t('Esse clube já tem 100 pessoas.');
  if (msg.includes('invalid_name')) return t('O nome do clube precisa ter de 3 a 40 letras.');
  if (msg.includes('blocked_word')) return t('⚠️ O nome ou a descrição tem uma palavra que não é permitida');
  if (msg.includes('rate_limited')) return t('Você criou clubes demais hoje. Tente amanhã.');
  if (msg.includes('blocked')) return t('⚠️ Sua conta não pode criar nem entrar em clubes no momento');
  return t('⚠️ Não deu para concluir — tente de novo');
}
