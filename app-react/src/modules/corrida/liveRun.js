import { addPoint, privateRoute } from './route';
import { addAltitude, elevationGain } from './elevation';
import { averageCadence } from './cadence';
import { cleanReps } from './intervals';

// Corrida ao vivo do EAFIT Run: cronômetro com pausa, distância e a marca de
// tempo de cada quilômetro (splits). O estado é puro (funções que devolvem um
// novo estado) e uma loja pequena guarda a corrida no aparelho, para resistir
// a recarregar a página, trocar de aba ou o sistema fechar o app.
//
// Estado: {
//   id, startedAt (ms), activeMs (tempo correndo antes do trecho atual),
//   segmentStart (ms do início do trecho atual; null = pausada),
//   meters, kmMarks (tempo de corrida, em ms, ao completar cada km),
//   sample { meters, elapsedMs } (última leitura, para interpolar o km),
//   gps (boolean), session (sessão do programa ou null), updatedAt,
//   route (percurso, route.js), routeBreak (próximo ponto começa trecho novo),
//   autoPaused (pausada pela pausa automática; o GPS segue ligado),
//   elev (elevation.js), steps/stepMs (passos e tempo medido, cadence.js)
// }

const KEY = 'eafit_live_run';
// Corrida sem sinal há mais tempo que isso é resto de um app fechado no meio.
export const STALE_MS = 12 * 60 * 60 * 1000;

export function newRunId(now = Date.now(), random = Math.random) {
  return `${now.toString(36)}-${Math.floor(random() * 1e9).toString(36)}`;
}

export function startRun({ gps = false, session = null } = {}, now = Date.now()) {
  return {
    id: newRunId(now), startedAt: now, activeMs: 0, segmentStart: now,
    meters: 0, kmMarks: [], sample: { meters: 0, elapsedMs: 0 },
    gps: !!gps, session, updatedAt: now, route: [], routeBreak: false,
  };
}

export const isPaused = s => !!s && s.segmentStart == null;

export function elapsedMs(s, now = Date.now()) {
  if (!s) return 0;
  return s.activeMs + (s.segmentStart != null ? Math.max(0, now - s.segmentStart) : 0);
}

// Pausa manual. Em pausa automática, vira manual (o GPS para de procurar movimento).
export function pauseRun(s, now = Date.now()) {
  if (!s) return s;
  if (isPaused(s)) return s.autoPaused ? { ...s, autoPaused: false, updatedAt: now } : s;
  return { ...s, activeMs: elapsedMs(s, now), segmentStart: null, routeBreak: true, autoPaused: false, updatedAt: now };
}

export function resumeRun(s, now = Date.now()) {
  if (!s || !isPaused(s)) return s;
  return { ...s, segmentStart: now, autoPaused: false, updatedAt: now };
}

// Pausa automática (autoPause.js): o cronômetro para em `at`, o último
// movimento, nunca antes do começo do trecho atual nem depois de agora. O GPS
// segue ligado para notar a volta, e o percurso continua no mesmo trecho
// (parar no semáforo não abre buraco no desenho).
export function autoPauseRun(s, at, now = Date.now()) {
  if (!s || isPaused(s)) return s;
  const when = Math.min(now, Math.max(Number.isFinite(at) ? at : now, s.segmentStart));
  const paused = pauseRun(s, when);
  const sample = s.sample ? { ...s.sample, elapsedMs: Math.min(s.sample.elapsedMs, paused.activeMs) } : s.sample;
  return { ...paused, sample, routeBreak: s.routeBreak, autoPaused: true, updatedAt: now };
}

export function autoResumeRun(s, now = Date.now()) {
  if (!s || !s.autoPaused) return s;
  return resumeRun(s, now);
}

// Nova distância total (metros). Cada km cruzado ganha a sua marca de tempo,
// interpolada entre a leitura anterior e esta (o GPS não lê no metro exato).
// Distância menor que a atual é ignorada: a soma só cresce.
export function setDistance(s, meters, now = Date.now()) {
  if (!s || !(meters > s.meters)) return s;
  const el = elapsedMs(s, now);
  const prev = s.sample || { meters: s.meters, elapsedMs: el };
  const kmMarks = [...s.kmMarks];
  for (let k = kmMarks.length + 1; k * 1000 <= meters; k++) {
    const span = meters - prev.meters;
    const frac = span > 0 ? (k * 1000 - prev.meters) / span : 1;
    kmMarks.push(Math.round(prev.elapsedMs + Math.max(0, Math.min(1, frac)) * (el - prev.elapsedMs)));
  }
  return { ...s, meters, kmMarks, sample: { meters, elapsedMs: el }, updatedAt: now };
}

// Ponto do GPS (graus) para o desenho do percurso. `jump`: o GPS saltou
// (túnel, perda de sinal) e o trecho recomeça no ponto novo.
export function addRoutePoint(s, lat, lon, { jump = false, now = Date.now() } = {}) {
  if (!s || isPaused(s)) return s;
  const route = addPoint(s.route, lat, lon, s.routeBreak || jump, elapsedMs(s, now) / 1000);
  if (route === s.route && !s.routeBreak) return s;
  return { ...s, route, routeBreak: false, updatedAt: now };
}

// Altitude do GPS (elevation.js). Pausada, não conta.
export function addElevation(s, altitude, altitudeAccuracy) {
  if (!s || isPaused(s)) return s;
  const elev = addAltitude(s.elev, altitude, altitudeAccuracy);
  return elev === s.elev ? s : { ...s, elev };
}

// Passos contados pelo acelerômetro desde a última vez (cadence.js).
export function addSteps(s, steps, ms) {
  if (!s || !(ms > 0)) return s;
  return { ...s, steps: (s.steps || 0) + Math.max(0, steps || 0), stepMs: (s.stepMs || 0) + ms };
}

// Segundos de cada km completo.
export function splitsOf(kmMarks) {
  return kmMarks.map((ms, i) => Math.round((ms - (i ? kmMarks[i - 1] : 0)) / 1000));
}

// Registro para salvar (runs.js). `meters` permite corrigir a distância no fim
// (corrida sem GPS ou GPS que falhou): sem os splits do GPS, ficam vazios.
export function finishRun(s, { now = Date.now(), meters, effort = null, notes = '', title = '', visibility = 'amigos', zones = [], shoeId = null } = {}) {
  const durationS = Math.max(1, Math.round(elapsedMs(s, now) / 1000));
  const manual = meters != null && Math.round(meters) !== Math.round(s.meters);
  const distance = Math.max(0, Math.round(manual ? meters : s.meters));
  const date = new Date(s.startedAt);
  const runDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return {
    client_id: s.id,
    run_date: runDate,
    started_at: date.toISOString(),
    duration_s: durationS,
    distance_m: distance,
    splits: manual ? [] : splitsOf(s.kmMarks),
    kind: s.session?.type && s.session.type !== 'livre' ? s.session.type : 'livre',
    program_week: s.session?.week || null,
    program_day: Number.isInteger(s.session?.dayIndex) ? s.session.dayIndex : null,
    gps: !!s.gps && !manual,
    // Percurso sem os 200 m do começo e do fim e sem as zonas de privacidade
    // (route.js); sem GPS, vazio.
    route: s.gps ? privateRoute(s.route, zones) : [],
    effort: Number.isInteger(effort) && effort >= 1 && effort <= 10 ? effort : null,
    notes: String(notes || '').trim().slice(0, 500) || null,
    title: String(title || '').trim().slice(0, 80) || null,
    visibility: visibility === 'privado' ? 'privado' : 'amigos',
    elev_gain_m: s.gps ? elevationGain(s.elev) : null,
    cadence: averageCadence(s.steps, s.stepMs),
    shoe_id: shoeId || null,
    intervals: cleanReps(s.reps).length ? cleanReps(s.reps) : null,
  };
}

// ---- App fechado no meio da corrida -----------------------------------------
// Com a corrida aberta, a tela marca de tempos em tempos que o app está vivo.
// Se o sistema fechou o app (ou o celular desligou), na volta o cronômetro
// teria contado o tempo todo fora: a tela pergunta o que fazer com esse tempo.

const SEEN_KEY = 'eafit_live_run_seen';
export const SEEN_EVERY_MS = 20 * 1000;
export const INTERRUPTED_MS = 3 * 60 * 1000;

export function markRunSeen(s, now = Date.now()) {
  if (!s) return;
  try { localStorage.setItem(SEEN_KEY, JSON.stringify({ id: s.id, at: now })); } catch { /* sem storage */ }
}

// Última vez que o app estava aberto com esta corrida.
export function lastSeenAt(s) {
  if (!s) return 0;
  let at = s.updatedAt || s.startedAt || 0;
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY));
    if (v && v.id === s.id && Number.isFinite(v.at)) at = Math.max(at, v.at);
  } catch { /* sem storage */ }
  return at;
}

// Desde quando (ms) a corrida rodando ficou sem o app aberto; null se não ficou.
export function interruptedSince(s, now = Date.now()) {
  if (!s || isPaused(s)) return null;
  const seen = lastSeenAt(s);
  return now - seen > INTERRUPTED_MS ? seen : null;
}

// ---- Loja: a corrida em andamento no aparelho -----------------------------

const listeners = new Set();
let cache;

function read(now = Date.now()) {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (!s || typeof s.id !== 'string' || !Number.isFinite(s.startedAt)) return null;
    if (now - (s.updatedAt || 0) > STALE_MS) return null;
    return s;
  } catch {
    return null;
  }
}

export function getLiveRun() {
  if (cache === undefined) cache = read();
  return cache;
}

export function setLiveRun(next) {
  cache = next || null;
  try {
    if (cache) localStorage.setItem(KEY, JSON.stringify(cache));
    else { localStorage.removeItem(KEY); localStorage.removeItem(SEEN_KEY); }
  } catch { /* sem storage: segue só na memória */ }
  listeners.forEach(fn => fn());
  return cache;
}

export const updateLiveRun = fn => setLiveRun(fn(getLiveRun()));

export function subscribeLiveRun(fn) {
  listeners.add(fn);
  const onStorage = e => { if (e.key === KEY) { cache = read(); fn(); } };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(fn); window.removeEventListener('storage', onStorage); };
}

// Corrida rodando (ou na pausa automática, que volta sozinha): o app não
// recarrega nem troca a tela inteira.
export const isRunActive = () => {
  const s = getLiveRun();
  return !!s && (!isPaused(s) || !!s.autoPaused);
};

// Só para testes.
export function resetLiveRunCache() { cache = undefined; }
