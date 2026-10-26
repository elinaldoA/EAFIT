// Distância percorrida a partir das leituras de GPS do navegador. O GPS de
// celular é ruidoso e "deriva" parado, então cada leitura passa por filtros
// antes de somar. Nada aqui guarda o trajeto: só o total em metros.

const EARTH_RADIUS_M = 6371000;
// Leitura com precisão pior que isso (metros) é descartada.
export const MAX_ACCURACY_M = 30;
// Deslocamento mínimo entre leituras aceitas; abaixo disso (ou da metade da
// precisão, o que for maior) conta como deriva do sinal, não como movimento.
export const MIN_STEP_M = 4;
// Velocidade acima disso (m/s, ≈ 43 km/h) é salto de GPS, não corrida.
export const MAX_SPEED_MS = 12;
// Depois de tantas leituras seguidas recusadas por salto, a última vira a nova
// âncora (túnel, perda de sinal): senão a contagem ficaria travada.
export const MAX_SKIPS = 5;

const toRad = deg => (deg * Math.PI) / 180;

// Distância em metros entre dois pontos { lat, lon } (fórmula de haversine).
export function haversineM(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const emptyTrack = (meters = 0) => ({ meters, last: null, skips: 0 });

// Esquece a última posição (pausa/retomada): o trecho parado não vira distância.
export const resetAnchor = track => ({ ...track, last: null, skips: 0 });

// fix: { lat, lon, accuracy, t (ms) }. Devolve { track, accepted, reason }, com
// reason: 'first' | 'moved' | 'accuracy' | 'time' | 'drift' | 'speed' | 'jump'.
export function applyFix(track, fix) {
  if (!(fix.accuracy <= MAX_ACCURACY_M)) return { track, accepted: false, reason: 'accuracy' };
  if (!track.last) return { track: { ...track, last: fix, skips: 0 }, accepted: true, reason: 'first' };

  const dt = (fix.t - track.last.t) / 1000;
  if (!(dt > 0)) return { track, accepted: false, reason: 'time' };

  const d = haversineM(track.last, fix);
  if (d < Math.max(MIN_STEP_M, fix.accuracy / 2)) return { track, accepted: false, reason: 'drift' };

  if (d / dt > MAX_SPEED_MS) {
    const skips = track.skips + 1;
    if (skips >= MAX_SKIPS) return { track: { ...track, last: fix, skips: 0 }, accepted: true, reason: 'jump' };
    return { track: { ...track, skips }, accepted: false, reason: 'speed' };
  }
  return { track: { meters: track.meters + d, last: fix, skips: 0 }, accepted: true, reason: 'moved' };
}
