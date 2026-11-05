import { haversineM } from './geoTrack';

// Percurso da corrida do EAFIT Run: os pontos do GPS já aceitos pelo filtro
// (geoTrack.js), em trechos — cada pausa começa um trecho novo, para o
// desenho não ligar com uma reta o lugar da pausa ao da retomada.
//
// Formato (igual no aparelho e no banco, coluna runs.route):
//   [[[lat, lon], [lat, lon], ...], [...]]   lat/lon em inteiros de 1e-5 grau (~1 m)
//
// Privacidade: ao salvar, os primeiros e os últimos 200 m somem (trimRoute)
// para o desenho não mostrar onde a pessoa mora. Corrida curta demais para
// esconder os dois lados com folga fica sem percurso. Não há mapa de fundo:
// nenhum serviço de fora recebe a localização.

export const PRIVACY_TRIM_M = 200;
// Pontos mais próximos que isso do anterior não entram (o desenho não precisa).
export const MIN_POINT_GAP_M = 8;
// Limite de pontos guardados (≈ 50 km com um ponto a cada 8 m).
export const MAX_POINTS = 6000;

const SCALE = 1e5;
const toInt = deg => Math.round(deg * SCALE);
const toDeg = n => ({ lat: n[0] / SCALE, lon: n[1] / SCALE });

export const countPoints = route => (route || []).reduce((n, seg) => n + seg.length, 0);

// Acrescenta um ponto (graus). `newSegment`: primeiro ponto depois de uma pausa.
export function addPoint(route, lat, lon, newSegment = false) {
  const list = Array.isArray(route) ? route : [];
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || countPoints(list) >= MAX_POINTS) return list;
  const point = [toInt(lat), toInt(lon)];
  const last = list.at(-1);
  if (!last || newSegment) return [...list, [point]];
  const prev = last.at(-1);
  if (prev && haversineM(toDeg(prev), toDeg(point)) < MIN_POINT_GAP_M) return list;
  return [...list.slice(0, -1), [...last, point]];
}

// Comprimento de cada trecho e total, em metros.
function measure(route) {
  let total = 0;
  const cum = route.map(seg => seg.map((p, i) => {
    if (i) total += haversineM(toDeg(seg[i - 1]), toDeg(p));
    return total;
  }));
  return { cum, total };
}

// Tira `meters` do começo e do fim do percurso (somando todos os trechos).
export function trimRoute(route, meters = PRIVACY_TRIM_M) {
  if (!Array.isArray(route) || !route.length) return [];
  const { cum, total } = measure(route);
  if (total < meters * 3) return [];
  return route
    .map((seg, s) => seg.filter((_, i) => cum[s][i] >= meters && cum[s][i] <= total - meters))
    .filter(seg => seg.length >= 2);
}

// Aceita só o formato esperado (dado vindo do banco ou do aparelho).
export function cleanRoute(route) {
  if (!Array.isArray(route)) return [];
  return route
    .filter(Array.isArray)
    .map(seg => seg.filter(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)))
    .filter(seg => seg.length >= 2);
}

// Desenho em SVG: caminhos que cabem em w×h com margem `pad`, mantendo a
// proporção (a longitude encolhe com o cosseno da latitude). null sem percurso.
export function projectRoute(route, w, h, pad = 8) {
  const segs = cleanRoute(route);
  if (!segs.length) return null;
  const pts = segs.flat();
  const lat0 = pts.reduce((s, p) => s + p[0], 0) / pts.length / SCALE;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xy = p => [p[1] * k, -p[0]];
  const all = pts.map(xy);
  const minX = Math.min(...all.map(p => p[0]));
  const maxX = Math.max(...all.map(p => p[0]));
  const minY = Math.min(...all.map(p => p[1]));
  const maxY = Math.max(...all.map(p => p[1]));
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
  const offX = (w - spanX * scale) / 2;
  const offY = (h - spanY * scale) / 2;
  const place = p => {
    const [x, y] = xy(p);
    return [Math.round((offX + (x - minX) * scale) * 10) / 10, Math.round((offY + (y - minY) * scale) * 10) / 10];
  };
  const paths = segs.map(seg => seg.map((p, i) => `${i ? 'L' : 'M'}${place(p).join(' ')}`).join(''));
  return { paths, start: place(segs[0][0]), end: place(segs.at(-1).at(-1)) };
}
