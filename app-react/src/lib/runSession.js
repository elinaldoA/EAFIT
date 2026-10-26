// Sessão de corrida em andamento, no nível do app. O cronômetro mora no
// CardioRow, que some quando a pessoa troca de aba ou fecha o modo treino; o
// que precisa continuar nesse meio-tempo (GPS, tela acesa, proteção contra
// recarregar ou sair sem querer) fica com o RunSessionHost, que lê esta sessão.
//
// A sessão vai para o localStorage: sobrevive a um F5 ou a um app que o
// sistema encerrou, e o cronômetro (que também é persistido) retoma de onde
// parou. Uma sessão sem sinal há mais de STALE_MS é lixo de um app fechado no
// meio da corrida e deixa de contar, senão travaria atualizações para sempre.

const KEY = 'eafit_run_session';
export const STALE_MS = 6 * 60 * 60 * 1000;

const listeners = new Set();
const emit = () => listeners.forEach(fn => fn());

let gpsState = { status: 'idle', accuracy: null };

// { nome, dia, running, gps, updatedAt } ou null.
export function readSession(now = Date.now()) {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (!s || typeof s.nome !== 'string' || !s.nome) return null;
    if (now - (s.updatedAt || 0) > STALE_MS) return null;
    return s;
  } catch {
    return null;
  }
}

export function setSession(patch) {
  const next = { ...(readSession() || {}), ...patch, updatedAt: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* sem storage */ }
  emit();
  return next;
}

// Encerra a sessão; com `nome`, só se for a deste exercício.
export function endSession(nome) {
  if (nome && readSession()?.nome !== nome) return;
  try { localStorage.removeItem(KEY); } catch { /* sem storage */ }
  gpsState = { status: 'idle', accuracy: null };
  emit();
}

export const isRunInProgress = () => !!readSession()?.running;

export const getGps = () => gpsState;

export function setGps(next) {
  if (next.status === gpsState.status && next.accuracy === gpsState.accuracy) return;
  gpsState = next;
  emit();
}

// A distância (no localStorage do item) mudou: quem a mostra deve reler.
export const notifyDistance = emit;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
