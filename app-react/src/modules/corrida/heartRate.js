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

// Zonas de esforço pela porcentagem da frequência máxima: Z1 até 60%, Z2 até
// 70%, Z3 até 80%, Z4 até 90%, Z5 acima. A máxima é a que a pessoa digitou no
// Perfil (user_metadata.hrMax) ou, sem ela, 220 menos a idade.
export const ZONE_COUNT = 5;
export const ZONE_LIMITS = [0.6, 0.7, 0.8, 0.9];
const toInt = v => (v === '' || v == null ? NaN : Math.round(Number(v)));

export function maxHeartRate(meta) {
  const typed = toInt(meta?.hrMax);
  if (typed >= 120 && typed <= 230) return typed;
  const age = toInt(meta?.idade);
  return age >= 10 && age <= 100 ? 220 - age : null;
}

// Zona (0 a 4) de uma leitura; 0 se não há máxima.
export function zoneOf(bpm, max) {
  if (!(max > 0)) return 0;
  const i = ZONE_LIMITS.findIndex(limit => bpm / max < limit);
  return i === -1 ? ZONE_COUNT - 1 : i;
}

// Característica "heart_rate_measurement" (GATT 0x2A37): o bit 0 dos flags diz
// se o valor tem 8 ou 16 bits. Devolve bpm ou null se estiver fora do normal.
export function parseHeartRate(view) {
  if (!view || view.byteLength < 2) return null;
  const flags = view.getUint8(0);
  if (flags & 1 && view.byteLength < 3) return null;
  const bpm = flags & 1 ? view.getUint16(1, true) : view.getUint8(1);
  return bpm >= MIN_BPM && bpm <= MAX_BPM ? bpm : null;
}

// Soma de leituras guardada na corrida em andamento: { hrSum, hrN, hrMax, hrZones }.
// zones: segundos em cada zona desde a última vez (opcional).
export function addHeart(s, sum, n, max, zones = null) {
  if (!s || !(n > 0) || !(sum > 0)) return s;
  const next = { ...s, hrSum: (s.hrSum || 0) + sum, hrN: (s.hrN || 0) + n, hrMax: Math.max(s.hrMax || 0, max || 0) };
  if (Array.isArray(zones) && zones.length === ZONE_COUNT) {
    next.hrZones = Array.from({ length: ZONE_COUNT }, (_, i) => (s.hrZones?.[i] || 0) + (Number(zones[i]) || 0));
  }
  return next;
}

// { avg, max, z? } da corrida, ou null sem leituras suficientes.
export function heartOf(s) {
  if (!s || !(s.hrN >= MIN_SAMPLES)) return null;
  const hr = cleanHr({ avg: s.hrSum / s.hrN, max: s.hrMax, z: s.hrZones });
  return hr;
}

export function cleanHr(hr) {
  if (!hr || typeof hr !== 'object') return null;
  const avg = Math.round(Number(hr.avg));
  const max = Math.round(Number(hr.max));
  if (![avg, max].every(v => Number.isFinite(v) && v >= MIN_BPM && v <= MAX_BPM) || avg > max) return null;
  const z = Array.isArray(hr.z) && hr.z.length === ZONE_COUNT ? hr.z.map(v => Math.round(Number(v))) : null;
  const validZones = z && z.every(v => Number.isFinite(v) && v >= 0 && v <= 86400) && z.some(v => v > 0);
  return validZones ? { avg, max, z } : { avg, max };
}

export const hrText = hr => {
  const h = cleanHr(hr);
  return h ? t('❤️ {v1} bpm em média · máx {v2}', { v1: h.avg, v2: h.max }) : '';
};
