import { db } from '../../lib/supabase';
import { parseLocalDate, toDateStr } from '../../lib/utils';
import { mondayOf } from './program';
import { cleanRoute, applyZones } from './route';
import { cleanReps } from './intervals';
import { cleanKmElev } from './elevation';
import { cleanWeather } from './weather';
import { cleanHr } from './heartRate';

import { t, decimal } from '../../lib/i18n';
// Corridas do EAFIT Run (tabela public.runs): salvar, listar, apagar e as
// contas de ritmo, totais e recordes. Corrida que não subiu (sem internet no
// fim do treino) fica numa fila no aparelho e sobe na próxima abertura; o
// client_id gerado no aparelho impede que o reenvio duplique.

// Corrida salva: as abas Correr e Corridas recarregam a lista.
export const RUN_SAVED_EVENT = 'eafit:run-saved';

const PENDING_KEY = 'eafit_runs_pending';
const COLUMNS = 'id, client_id, run_date, started_at, title, visibility, duration_s, distance_m, splits, route, kind, program_week, program_day, gps, effort, notes, elev_gain_m, cadence, shoe_id';
// Colunas de migrations mais novas (tiros do intervalado, subida por km): sem
// a migration a coluna falta e o app segue sem esse dado, só aquela coluna sai.
const OPTIONAL_COLUMNS = ['intervals', 'km_elev', 'weather', 'hr', 'tagged'];
const columnsWith = extras => [COLUMNS, ...extras].join(', ');
const hasValue = v => (Array.isArray(v) ? v.length > 0 : !!v && typeof v === 'object' && Object.keys(v).length > 0);
// Só vale erro de coluna inexistente que cite o nome inteiro da coluna: 'hr' não pode casar com 'through'
// nem com o nome de uma constraint como runs_hr_shape.
export const missingColumn = (error, columns) => {
  const text = error ? `${error.message || ''} ${error.details || ''}` : '';
  if (!/column|schema cache/i.test(text)) return undefined;
  return columns.find(c => new RegExp(`(^|[^a-z0-9_])${c}($|[^a-z0-9_])`, 'i').test(text));
};

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

// Separador decimal do idioma do app (lib/i18n).
export { decimal };

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

// Corrida com tempo por km ou percurso veio do GPS: distância e tempo não se
// editam (os parciais, o mapa e os recordes deixariam de bater). Só a lançada
// à mão pode ter data, distância e tempo corrigidos.
export const canEditMeasures = run => !(run?.splits?.length || run?.route?.length || run?.gps || run?.intervals?.length);

// Valores iniciais do formulário de edição, no formato dos campos.
export function editFormFrom(run) {
  const s = Math.max(0, Number(run.duration_s) || 0);
  const start = new Date(run.started_at);
  const pad = n => String(n).padStart(2, '0');
  return {
    title: run.title || '',
    notes: run.notes || '',
    effort: run.effort || null,
    visibility: run.visibility === 'privado' ? 'privado' : 'amigos',
    shoeId: run.shoe_id || null,
    tagged: cleanTagged(run.tagged),
    date: run.run_date,
    time: Number.isNaN(start.getTime()) ? '00:00' : `${pad(start.getHours())}:${pad(start.getMinutes())}`,
    hours: String(Math.floor(s / 3600)),
    minutes: String(Math.floor((s % 3600) / 60)),
    seconds: String(s % 60),
    km: decimal((run.distance_m / 1000).toFixed(2).replace(/\.?0+$/, '')),
  };
}

// Confere o formulário de edição e devolve { patch } (só as colunas que mudam
// no banco) ou { error } com a mensagem para a pessoa.
export function editRun(run, form, now = Date.now()) {
  const patch = {
    title: String(form.title || '').trim().slice(0, 80) || null,
    notes: String(form.notes || '').trim().slice(0, 500) || null,
    effort: Number.isInteger(form.effort) && form.effort >= 1 && form.effort <= 10 ? form.effort : null,
    visibility: form.visibility === 'privado' ? 'privado' : 'amigos',
    shoe_id: form.shoeId || null,
  };
  // Amigos marcados: só vai na edição se mudou (sem a migration a coluna não existe).
  const tagged = cleanTagged(form.tagged);
  if (tagged.join() !== cleanTagged(run.tagged).join()) patch.tagged = tagged;
  if (canEditMeasures(run)) {
    const measured = manualRun({ ...form, title: '' }, now);
    if (measured.error) return { error: measured.error };
    const { run_date, started_at, duration_s, distance_m } = measured.record;
    // Data e hora só mudam se a pessoa mexeu: refazê-las do relógio local do aparelho moveria
    // uma corrida perto da meia-noite (ou com outro fuso) sem ninguém pedir.
    const initial = editFormFrom(run);
    const sameStart = form.date === initial.date && form.time === initial.time;
    Object.assign(patch, { duration_s, distance_m }, sameStart ? {} : { run_date, started_at });
  }
  return { patch };
}

export const runTitle = run =>(run?.title && run.title.trim()) || defaultRunTitle(run?.started_at || Date.now());

// ---- Banco -----------------------------------------------------------------

// Ids de amigos marcados: só texto, sem repetir, no máximo 10.
export const cleanTagged = list => (Array.isArray(list) ? [...new Set(list.filter(x => typeof x === 'string' && x))].slice(0, 10) : []);

function normalizeRow(r) {
  return {
    ...r,
    tagged: cleanTagged(r.tagged),
    duration_s: Number(r.duration_s) || 0,
    distance_m: Number(r.distance_m) || 0,
    splits: Array.isArray(r.splits) ? r.splits.map(Number).filter(n => n > 0) : [],
    route: cleanRoute(r.route),
    elev_gain_m: r.elev_gain_m == null ? null : Number(r.elev_gain_m),
    cadence: r.cadence == null ? null : Number(r.cadence),
    shoe_id: r.shoe_id || null,
    intervals: cleanReps(r.intervals),
    km_elev: cleanKmElev(r.km_elev),
    weather: cleanWeather(r.weather),
    hr: cleanHr(r.hr),
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

// false quando o aparelho não conseguiu gravar (sem storage ou cheio).
function writePending(all) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(all)); return true; } catch { return false; }
}

export const pendingRuns = userId => readPending()[userId] || [];

function setPending(userId, list) {
  const all = readPending();
  if (list.length) all[userId] = list;
  else delete all[userId];
  return writePending(all);
}

// O servidor respondeu e recusou a corrida (dado ou regra que não passa: classes
// 22 e 23 do Postgres, ou coluna/tabela inexistente), diferente de falta de
// internet ou sessão vencida, que passam sozinhas. 42501 (RLS) fica de fora: é
// o que sessão vencida costuma devolver.
export function isRejectedByServer(err) {
  const code = String(err?.code || '');
  return /^(22|23)\w{3}$/.test(code) || code === '42703' || code === '42P01';
}

async function insertRun(userId, run, extras = OPTIONAL_COLUMNS.filter(c => hasValue(run[c]))) {
  // Só manda as colunas novas quando há dado: corrida comum não depende das migrations.
  const rest = Object.fromEntries(Object.entries(run).filter(([key]) => !OPTIONAL_COLUMNS.includes(key)));
  const optional = Object.fromEntries(extras.map(c => [c, run[c]]));
  const { data, error } = await db
    .from('runs')
    .upsert({ ...rest, ...optional, user_id: userId }, { onConflict: 'user_id,client_id' })
    .select(columnsWith(extras))
    .single();
  const missing = missingColumn(error, extras);
  if (missing) return insertRun(userId, { ...run, [missing]: null }, extras.filter(c => c !== missing));
  // Tênis apagado enquanto a corrida esperava internet: sobe sem o tênis.
  if (error?.code === '23503' && run.shoe_id) return insertRun(userId, { ...run, shoe_id: null });
  if (error) throw error;
  return normalizeRow(data);
}

// Salva a corrida; sem conexão, guarda na fila e devolve { pending: true }.
// rejected: o servidor recusou (fica na fila e é tentada de novo, mas a tela não
// pode dizer "sem internet"). lost: nem a fila do aparelho aceitou (sem espaço);
// quem chamou deve manter a corrida na tela em vez de descartá-la.
export async function saveRun(userId, run) {
  try {
    return { run: await insertRun(userId, run), pending: false };
  } catch (err) {
    console.error('saveRun:', err);
    const queued = setPending(userId, [...pendingRuns(userId).filter(r => r.client_id !== run.client_id), run]);
    return { run: normalizeRow(run), pending: queued, lost: !queued, rejected: isRejectedByServer(err) };
  }
}

// Quantas vezes o servidor pode recusar uma corrida da fila antes de parar de
// tentar sozinho. Ela continua no aparelho (e na lista, marcada como recusada)
// para a pessoa apagar ou editar; falta de internet nunca conta.
export const MAX_REJECTIONS = 5;
export const isStuck = run => (run?.rejections || 0) >= MAX_REJECTIONS;

// Sobe a fila do aparelho. Devolve quantas subiram.
export async function flushPendingRuns(userId) {
  const list = pendingRuns(userId);
  if (!list.length) return 0;
  const left = [];
  let sent = 0;
  let changed = false;
  for (const run of list) {
    if (isStuck(run)) { left.push(run); continue; }
    try { await insertRun(userId, run); sent++; changed = true; } catch (err) {
      if (isRejectedByServer(err)) { left.push({ ...run, rejections: (run.rejections || 0) + 1 }); changed = true; } else left.push(run);
    }
  }
  if (changed) setPending(userId, left);
  return sent;
}

// Última lista carregada, só com o que os recordes e conquistas precisam (sem o
// percurso), para os selos do cartão aparecerem também sem internet.
const RUNS_CACHE_KEY = 'eafit_runs_cache';
const RUNS_CACHE_MAX = 400;

function rememberRuns(userId, rows) {
  try {
    const slim = rows.slice(0, RUNS_CACHE_MAX).map(r => ({ client_id: r.client_id, run_date: r.run_date, started_at: r.started_at, distance_m: r.distance_m, duration_s: r.duration_s, splits: r.splits }));
    localStorage.setItem(RUNS_CACHE_KEY, JSON.stringify({ userId, runs: slim }));
  } catch { /* sem storage: sem cache */ }
}

// Lista guardada da última vez que carregou; [] sem nada guardado ou se for de outra conta.
export function cachedRuns(userId) {
  try {
    const saved = JSON.parse(localStorage.getItem(RUNS_CACHE_KEY) || 'null');
    return saved?.userId === userId && Array.isArray(saved.runs) ? saved.runs : [];
  } catch {
    return [];
  }
}

// Corridas da pessoa (as da fila do aparelho entram também), mais recentes primeiro.
// light: sem o percurso (a parte mais pesada), para contas que só usam números
// (recordes, medalhas, conquistas, tênis).
export async function fetchRuns(userId, { light = false } = {}) {
  const query = columns => db
    .from('runs')
    .select(light ? columns.replace(' route,', '') : columns)
    .eq('user_id', userId)
    .order('run_date', { ascending: false })
    .order('started_at', { ascending: false });
  let columns = OPTIONAL_COLUMNS;
  let { data, error } = await query(columnsWith(columns));
  for (let missing = missingColumn(error, columns); missing; missing = missingColumn(error, columns)) {
    columns = columns.filter(c => c !== missing);
    ({ data, error } = await query(columnsWith(columns)));
  }
  if (error) throw error;
  const rows = (data || []).map(normalizeRow);
  rememberRuns(userId, rows);
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
    kudos: Number(r.rf_kudos) || 0, kudoed: !!r.rf_kudoed, comments: Number(r.rf_comments) || 0, weather: cleanWeather(r.rf_weather),
    // Parciais, subida e cadência (migration 20270305130000); sem elas o cartão só fica sem o gráfico.
    splits: Array.isArray(r.rf_splits) ? r.rf_splits.map(Number).filter(n => n > 0) : [],
    km_elev: cleanKmElev(r.rf_km_elev),
    elev_gain_m: r.rf_elev_gain_m == null ? null : Number(r.rf_elev_gain_m),
    cadence: r.rf_cadence == null ? null : Number(r.rf_cadence),
    // Frequência cardíaca e nome do tênis (migration 20270305140000).
    hr: cleanHr(r.rf_hr),
    shoe_name: r.rf_shoe_name ? String(r.rf_shoe_name) : null,
    // Nomes dos amigos marcados na corrida (migration 20270305150000).
    tags: Array.isArray(r.rf_tags) ? r.rf_tags.filter(n => typeof n === 'string' && n).slice(0, 10) : [],
    // Caminhos das fotos da corrida (migration 20270305160000).
    photos: Array.isArray(r.rf_photos) ? r.rf_photos.filter(p => typeof p === 'string' && p).slice(0, 4) : [],
  }));
}

// Amigos que dá para marcar numa corrida: [{ id, name }]. Vazio se a função ainda não existe no banco.
export async function fetchTaggableFriends() {
  const { data, error } = await db.rpc('run_taggable_friends');
  if (error) return [];
  return (data || []).map(r => ({ id: r.tf_user, name: r.tf_name }));
}

// Recarrega a primeira página do feed sem perder as páginas mais antigas que a
// pessoa já abriu: fica a página nova e, depois dela, o que já estava carregado
// e é mais antigo que o fim dela.
export function mergeFeed(previous, firstPage) {
  if (!previous?.length || !firstPage.length) return firstPage;
  const oldest = firstPage.at(-1).started_at;
  const ids = new Set(firstPage.map(r => r.id));
  return [...firstPage, ...previous.filter(r => !ids.has(r.id) && r.started_at < oldest)];
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

// Grava a edição. Corrida que ainda espera internet muda só na fila do aparelho.
export async function updateRun(userId, run, patch) {
  if (run.pending) {
    setPending(userId, pendingRuns(userId).map(r => (r.client_id === run.client_id ? { ...r, ...patch } : r)));
    return { ...run, ...patch };
  }
  const { error } = await db.from('runs').update(patch).eq('id', run.id).eq('user_id', userId);
  if (error) throw error;
  return { ...run, ...patch };
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

// Tênis, comentários e clubes moram em arquivos próprios e saem daqui também.
export * from './runsShoes';
export * from './runsComments';
export * from './runsClubs';
