import { haversineM } from './geoTrack';
import { worldPx, TILE_SIZE } from './route';
import { paceSeconds } from './runs';

// Planejador de rotas: a pessoa toca no mapa para marcar os pontos do percurso e vê a
// distância, o tempo estimado no ritmo dela e baixa o GPX para o relógio. Aqui fica só a
// conta (sem tela): pontos são { lat, lon } em graus.

export const MAX_PLAN_POINTS = 200;
export const MIN_ZOOM = 3;
export const MAX_ZOOM = 18;

const esc = s => String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

// Distância do percurso em linha reta entre os pontos, em metros.
export function planDistanceM(points) {
  let m = 0;
  for (let i = 1; i < points.length; i++) m += haversineM(points[i - 1], points[i]);
  return Math.round(m);
}

// Tempo estimado (s) no ritmo (s/km); null sem ritmo ou sem distância.
export function estimateSeconds(distanceM, paceSecPerKm) {
  if (!(distanceM > 0) || !(paceSecPerKm > 0)) return null;
  return Math.round((distanceM / 1000) * paceSecPerKm);
}

// Ritmo médio das últimas corridas com GPS (até 10), ponderado pela distância; null sem corrida.
export function averagePace(runs) {
  const list = (runs || []).filter(r => r?.gps && r.distance_m > 0 && r.duration_s > 0).slice(0, 10);
  const meters = list.reduce((s, r) => s + r.distance_m, 0);
  const seconds = list.reduce((s, r) => s + r.duration_s, 0);
  return paceSeconds(seconds, meters);
}

// Adiciona um ponto (ignora o repetido e passa do limite).
export function addPlanPoint(points, p) {
  if (points.length >= MAX_PLAN_POINTS) return points;
  const last = points.at(-1);
  if (last && last.lat === p.lat && last.lon === p.lon) return points;
  return [...points, { lat: Math.round(p.lat * 1e5) / 1e5, lon: Math.round(p.lon * 1e5) / 1e5 }];
}

// Fecha o circuito: volta ao primeiro ponto (se ainda não estiver lá).
export function closeLoop(points) {
  if (points.length < 2) return points;
  const [first] = points;
  const last = points.at(-1);
  return last.lat === first.lat && last.lon === first.lon ? points : [...points, { ...first }];
}

// Volta pelo mesmo caminho: repete os pontos em ordem inversa.
export function outAndBack(points) {
  if (points.length < 2) return points;
  return [...points, ...points.slice(0, -1).reverse()].slice(0, MAX_PLAN_POINTS);
}

// GPX de rota (rte): relógios e apps de navegação leem como percurso a seguir.
export function buildPlanGpx(points, name = '') {
  const pts = points.map(p => `    <rtept lat="${p.lat.toFixed(5)}" lon="${p.lon.toFixed(5)}"></rtept>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="EAFIT Run" xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <name>${esc(String(name || 'EAFIT Run').slice(0, 80))}</name>
${pts}
  </rte>
</gpx>
`;
}

// ---- Vista do mapa (centro + zoom, sem percurso) ----

const clampZoom = z => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(z)));

// Vista de um quadro w×h centrado em { lat, lon } no zoom z: blocos, e as funções que
// levam um ponto da terra ao quadro (place) e um toque no quadro à terra (invert).
export function planView(center, z, w, h) {
  const zoom = clampZoom(z);
  const [cx, cy] = worldPx(center.lat, center.lon, zoom);
  const ox = cx - w / 2;
  const oy = cy - h / 2;
  const count = 2 ** zoom;
  const tiles = [];
  for (let ty = Math.floor(oy / TILE_SIZE); ty <= Math.floor((oy + h - 1) / TILE_SIZE); ty++) {
    if (ty < 0 || ty >= count) continue;
    for (let tx = Math.floor(ox / TILE_SIZE); tx <= Math.floor((ox + w - 1) / TILE_SIZE); tx++) {
      tiles.push({ z: zoom, x: ((tx % count) + count) % count, y: ty, left: tx * TILE_SIZE - ox, top: ty * TILE_SIZE - oy });
    }
  }
  const place = p => {
    const [x, y] = worldPx(p.lat, p.lon, zoom);
    return [Math.round((x - ox) * 10) / 10, Math.round((y - oy) * 10) / 10];
  };
  const invert = (px, py) => {
    const n = TILE_SIZE * 2 ** zoom;
    const x = ox + px;
    const y = oy + py;
    const lon = (x / n) * 360 - 180;
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
    return { lat, lon };
  };
  return { zoom, tiles, place, invert };
}

// Novo centro depois de arrastar o mapa `dx, dy` px (o conteúdo acompanha o dedo).
export function panCenter(center, z, dx, dy) {
  const zoom = clampZoom(z);
  const [cx, cy] = worldPx(center.lat, center.lon, zoom);
  const n = TILE_SIZE * 2 ** zoom;
  const x = cx - dx;
  const y = cy - dy;
  return {
    lon: ((((x / n) * 360 - 180) + 540) % 360) - 180,
    lat: Math.max(-85, Math.min(85, (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI)),
  };
}

export { clampZoom };
