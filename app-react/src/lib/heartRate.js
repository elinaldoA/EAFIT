import { getDateForWeekday } from './utils';

// Cinta cardíaca por Web Bluetooth (perfil padrão Heart Rate, 0x180D): Polar,
// Garmin, Wahoo, Coospo e afins, e relógios que transmitem o batimento.
// Só existe no Chrome/Edge (Android, Windows, Mac, ChromeOS); no iPhone o
// navegador não tem Bluetooth e o botão nem aparece.
//
// A conexão é do app, não da tela: fica neste módulo, então sair e voltar
// ao modo treino não derruba a cinta. A gravação do treino (média, máxima e
// tempo por zona) é do dia, em localStorage hr_<data>, e só soma enquanto o
// cronômetro do treino está correndo (useHeartRateRecorder).

const listeners = new Set();
let state = { status: 'off', bpm: null, deviceName: '' }; // off | connecting | on | lost
let device = null;
let characteristic = null;
let manualDisconnect = false;

export function isHeartRateSupported() {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth?.requestDevice;
}

export function getHeartRateState() {
  return state;
}

export function subscribeHeartRate(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach(fn => fn(state));
}

// Medição do Heart Rate Measurement (0x2A37): bit 0 das flags diz se o valor
// vem em 8 ou 16 bits. Devolve null para leitura fora da faixa humana.
export function parseHeartRate(dataView) {
  const flags = dataView.getUint8(0);
  const bpm = flags & 0x1 ? dataView.getUint16(1, true) : dataView.getUint8(1);
  return bpm >= 30 && bpm <= 250 ? bpm : null;
}

function handleValue(event) {
  const bpm = parseHeartRate(event.target.value);
  if (bpm) setState({ bpm, status: 'on' });
}

async function subscribe() {
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService('heart_rate');
  characteristic = await service.getCharacteristic('heart_rate_measurement');
  characteristic.addEventListener('characteristicvaluechanged', handleValue);
  await characteristic.startNotifications();
}

// Queda de sinal (cinta longe, pilha): tenta voltar algumas vezes antes de
// desistir; o usuário vê "sem sinal" e pode tocar para reconectar.
async function handleDisconnect() {
  characteristic = null;
  if (manualDisconnect) return;
  setState({ status: 'lost', bpm: null });
  for (let attempt = 0; attempt < 3; attempt++) {
    await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
    if (manualDisconnect || !device) return;
    try {
      await subscribe();
      setState({ status: 'on' });
      return;
    } catch { /* tenta de novo */ }
  }
}

// Precisa ser chamada a partir de um toque (o navegador exige gesto do usuário
// para abrir o seletor de dispositivos). Lança o erro do navegador; o seletor
// fechado sem escolher vem como NotFoundError.
export async function connectHeartRate() {
  if (!isHeartRateSupported()) throw new Error('unsupported');
  manualDisconnect = false;
  if (device?.gatt?.connected && characteristic) return;
  setState({ status: 'connecting' });
  try {
    if (!device) {
      device = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
      device.addEventListener('gattserverdisconnected', handleDisconnect);
    }
    await subscribe();
    setState({ status: 'on', deviceName: device.name || '' });
  } catch (err) {
    setState({ status: device ? 'lost' : 'off', bpm: null });
    throw err;
  }
}

export function disconnectHeartRate() {
  manualDisconnect = true;
  try { characteristic?.removeEventListener('characteristicvaluechanged', handleValue); } catch { /* já caiu */ }
  try { device?.gatt?.disconnect(); } catch { /* já caiu */ }
  characteristic = null;
  device = null;
  setState({ status: 'off', bpm: null, deviceName: '' });
}

export function friendlyHeartRateError(err) {
  if (err?.name === 'NotFoundError') return null; // fechou o seletor
  if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') return 'permission';
  return 'generic';
}

// ---- Zonas e gravação do treino ----

// FC máxima estimada (220 − idade); sem idade, 30 anos.
export function maxHeartRate(idade) {
  const age = parseInt(idade, 10);
  return 220 - (age >= 10 && age <= 100 ? age : 30);
}

// Zona 1..5 pelo % da FC máxima: <60, 60-70, 70-80, 80-90, ≥90.
export function heartRateZone(bpm, max) {
  const pct = bpm / max;
  if (pct >= 0.9) return 5;
  if (pct >= 0.8) return 4;
  if (pct >= 0.7) return 3;
  if (pct >= 0.6) return 2;
  return 1;
}

export function emptySession() {
  return { samples: 0, sum: 0, max: 0, zones: [0, 0, 0, 0, 0], lastAt: null };
}

// Soma uma leitura. O tempo desde a leitura anterior conta na zona desta,
// limitado a 5 s (cinta que some por um tempo não infla a zona).
export function addSample(session, bpm, max, at) {
  const next = { ...session, zones: [...session.zones] };
  next.samples += 1;
  next.sum += bpm;
  next.max = Math.max(next.max, bpm);
  if (session.lastAt != null) {
    const secs = Math.min(5, Math.max(0, (at - session.lastAt) / 1000));
    next.zones[heartRateZone(bpm, max) - 1] += secs;
  }
  next.lastAt = at;
  return next;
}

// Resumo para gravar em workouts (hr_avg, hr_max, hr_zones) ou null sem dados.
export function summarizeSession(session) {
  if (!session || session.samples < 5) return null;
  return {
    avg: Math.round(session.sum / session.samples),
    max: session.max,
    zones: session.zones.map(s => Math.round(s)),
  };
}

const sessionKey = dia => `hr_${getDateForWeekday(dia)}`;

export function readSession(dia) {
  try {
    const raw = JSON.parse(localStorage.getItem(sessionKey(dia)));
    return raw && Array.isArray(raw.zones) ? raw : emptySession();
  } catch {
    return emptySession();
  }
}

export function writeSession(dia, session) {
  try { localStorage.setItem(sessionKey(dia), JSON.stringify(session)); } catch { /* cota cheia */ }
}

export function clearSession(dia) {
  try { localStorage.removeItem(sessionKey(dia)); } catch { /* sem armazenamento */ }
}
