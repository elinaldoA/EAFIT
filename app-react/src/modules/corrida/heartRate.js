import { t } from '../../lib/i18n';
// Frequência cardíaca por cinta Bluetooth (serviço padrão "heart_rate", usado
// por Polar, Garmin, Wahoo e a maioria das cintas e relógios em modo
// transmissão). Só funciona onde há Web Bluetooth: Chrome no Android e no
// computador; no iPhone o Safari não oferece. A corrida guarda a média e a
// máxima (runs.hr = { avg, max }), nada de leitura por leitura.

export const hrSupported = () => typeof navigator !== 'undefined' && !!navigator.bluetooth;

// Leitura válida de uma pessoa correndo; fora disso é ruído da cinta.
const MIN_BPM = 30;
const MAX_BPM = 250;
// Leituras mínimas para a corrida guardar média (cinta conectada tarde demais não vale).
export const MIN_SAMPLES = 10;

// Característica "heart_rate_measurement" (GATT 0x2A37): o bit 0 dos flags diz
// se o valor tem 8 ou 16 bits. Devolve bpm ou null se estiver fora do normal.
export function parseHeartRate(view) {
  if (!view || view.byteLength < 2) return null;
  const flags = view.getUint8(0);
  if (flags & 1 && view.byteLength < 3) return null;
  const bpm = flags & 1 ? view.getUint16(1, true) : view.getUint8(1);
  return bpm >= MIN_BPM && bpm <= MAX_BPM ? bpm : null;
}

// Soma de leituras guardada na corrida em andamento: { hrSum, hrN, hrMax }.
export function addHeart(s, sum, n, max) {
  if (!s || !(n > 0) || !(sum > 0)) return s;
  return { ...s, hrSum: (s.hrSum || 0) + sum, hrN: (s.hrN || 0) + n, hrMax: Math.max(s.hrMax || 0, max || 0) };
}

// { avg, max } da corrida, ou null sem leituras suficientes.
export function heartOf(s) {
  if (!s || !(s.hrN >= MIN_SAMPLES)) return null;
  return cleanHr({ avg: s.hrSum / s.hrN, max: s.hrMax });
}

export function cleanHr(hr) {
  if (!hr || typeof hr !== 'object') return null;
  const avg = Math.round(Number(hr.avg));
  const max = Math.round(Number(hr.max));
  if (![avg, max].every(v => Number.isFinite(v) && v >= MIN_BPM && v <= MAX_BPM) || avg > max) return null;
  return { avg, max };
}

export const hrText = hr => {
  const h = cleanHr(hr);
  return h ? t('❤️ {v1} bpm em média · máx {v2}', { v1: h.avg, v2: h.max }) : '';
};
