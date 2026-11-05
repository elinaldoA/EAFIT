import { haversineM } from './geoTrack';

// Percurso da corrida do EAFIT Run: os pontos do GPS já aceitos pelo filtro
// (geoTrack.js), em trechos — cada pausa começa um trecho novo, para o
// desenho não ligar com uma reta o lugar da pausa ao da retomada.
//
// Formato (igual no aparelho e no banco, coluna runs.route):
//   [[[lat, lon, t], [lat, lon, t], ...], [...]]
//   lat/lon em inteiros de 1e-5 grau (~1 m); t = segundos de corrida (sem as
//   pausas) desde o início, para as marcas de km e o ritmo por trecho.
//   Corridas gravadas antes de 2026-11 têm só [lat, lon]: aparecem sem eles.
//
// Privacidade: ao salvar, os primeiros e os últimos 200 m somem (trimRoute)
// e também o que passar pelas zonas de privacidade da pessoa (applyZones),
// para o mapa não mostrar onde ela mora. Corrida curta demais para esconder
// os dois lados com folga fica sem percurso.

export const PRIVACY_TRIM_M = 200;
// Pontos mais próximos que isso do anterior não entram (o desenho não precisa).
export const MIN_POINT_GAP_M = 8;
// Limite de pontos guardados (≈ 50 km com um ponto a cada 8 m).
export const MAX_POINTS = 6000;

const SCALE = 1e5;
const toInt = deg => Math.round(deg * SCALE);
const toDeg = n => ({ lat: n[0] / SCALE, lon: n[1] / SCALE });

export const countPoints = route => (route || []).reduce((n, seg) => n + seg.length, 0);

// Acrescenta um ponto (graus). `newSegment`: primeiro ponto depois de uma
// pausa. `t`: segundos de corrida até o ponto (opcional).
export function addPoint(route, lat, lon, newSegment = false, t = null) {
  const list = Array.isArray(route) ? route : [];
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || countPoints(list) >= MAX_POINTS) return list;
  const point = Number.isFinite(t) && t >= 0 ? [toInt(lat), toInt(lon), Math.round(t)] : [toInt(lat), toInt(lon)];
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
    .map(seg => seg.filter(p => Array.isArray(p) && (p.length === 2 || p.length === 3) && p.every(Number.isFinite)))
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

// ---- Mapa de fundo (blocos do OpenStreetMap) ----
// Mesma projeção dos blocos (Web Mercator): o percurso cai certinho sobre as
// ruas. Calculado aqui para o mapa ser só <img> + <svg>, sem biblioteca.
export const TILE_SIZE = 256;
export const MAX_MAP_ZOOM = 17;
const MIN_MAP_ZOOM = 3;

// Posição em pixels do "mundo" no zoom z.
function worldPx(lat, lon, z) {
  const n = TILE_SIZE * 2 ** z;
  const phi = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180;
  return [((lon + 180) / 360) * n, ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * n];
}

// Vista do mapa para um quadro w×h: o maior zoom em que o percurso cabe
// (com `pad` de folga), os blocos que cobrem o quadro ({ z, x, y, left, top },
// left/top em px do quadro) e o percurso já em px do quadro. null sem percurso.
export function mapView(route, w, h, pad = 16) {
  const segs = cleanRoute(route);
  if (!segs.length) return null;
  const pts = segs.flat().map(toDeg);
  let z = MAX_MAP_ZOOM;
  let box;
  for (; z >= MIN_MAP_ZOOM; z--) {
    const px = pts.map(p => worldPx(p.lat, p.lon, z));
    box = {
      minX: Math.min(...px.map(p => p[0])), maxX: Math.max(...px.map(p => p[0])),
      minY: Math.min(...px.map(p => p[1])), maxY: Math.max(...px.map(p => p[1])),
    };
    if (box.maxX - box.minX <= w - 2 * pad && box.maxY - box.minY <= h - 2 * pad) break;
  }
  z = Math.max(z, MIN_MAP_ZOOM);
  const ox = (box.minX + box.maxX) / 2 - w / 2;
  const oy = (box.minY + box.maxY) / 2 - h / 2;
  const count = 2 ** z;
  const tiles = [];
  for (let ty = Math.floor(oy / TILE_SIZE); ty <= Math.floor((oy + h - 1) / TILE_SIZE); ty++) {
    if (ty < 0 || ty >= count) continue;
    for (let tx = Math.floor(ox / TILE_SIZE); tx <= Math.floor((ox + w - 1) / TILE_SIZE); tx++) {
      tiles.push({ z, x: ((tx % count) + count) % count, y: ty, left: tx * TILE_SIZE - ox, top: ty * TILE_SIZE - oy });
    }
  }
  const place = n => {
    const p = toDeg(n);
    const [x, y] = worldPx(p.lat, p.lon, z);
    return [Math.round((x - ox) * 10) / 10, Math.round((y - oy) * 10) / 10];
  };
  const paths = segs.map(seg => seg.map((p, i) => `${i ? 'L' : 'M'}${place(p).join(' ')}`).join(''));
  // place: projeta outros pontos [lat, lon] (inteiros) no mesmo quadro (marcas de km, ritmo).
  return { z, tiles, paths, place, start: place(segs[0][0]), end: place(segs.at(-1).at(-1)) };
}

// ---- Zonas de privacidade ----
// Lugares que a pessoa não quer mostrar (casa, trabalho): { lat, lon, r }, em
// graus e metros. Todo ponto a menos de r do centro sai do percurso, e o
// trecho é cortado ali (a linha não atravessa a zona).
export const ZONE_RADII = [200, 400, 800];
export const MAX_ZONES = 5;

export function cleanZones(zones) {
  if (!Array.isArray(zones)) return [];
  return zones
    .filter(z => z && Number.isFinite(z.lat) && Number.isFinite(z.lon) && Math.abs(z.lat) <= 90 && Math.abs(z.lon) <= 180)
    .map(z => ({
      lat: Math.round(z.lat * 1e4) / 1e4,
      lon: Math.round(z.lon * 1e4) / 1e4,
      r: ZONE_RADII.includes(z.r) ? z.r : ZONE_RADII[1],
      name: String(z.name || '').slice(0, 30),
    }))
    .slice(0, MAX_ZONES);
}

export function applyZones(route, zones) {
  const list = cleanZones(zones);
  const segs = cleanRoute(route);
  if (!list.length || !segs.length) return segs;
  const inside = p => list.some(z => haversineM(z, toDeg(p)) < z.r);
  const out = [];
  for (const seg of segs) {
    let cur = [];
    for (const p of seg) {
      if (inside(p)) {
        if (cur.length >= 2) out.push(cur);
        cur = [];
      } else cur.push(p);
    }
    if (cur.length >= 2) out.push(cur);
  }
  return out;
}

// O que vai para o banco: sem os 200 m das pontas e sem as zonas.
export const privateRoute = (route, zones) => applyZones(trimRoute(cleanRoute(route)), zones);

// ---- Marcas de km e ritmo por trecho (pontos com t) ----
const hasTime = segs => segs.length > 0 && segs.every(seg => seg.every(p => p.length === 3));

// Posição de cada km completo, pelos tempos de cada km da corrida (splits, em
// s): o km k termina no instante soma(splits[0..k-1]). Usar o tempo (e não a
// distância do desenho) acerta mesmo com as pontas e as zonas cortadas. Km
// que caiu num pedaço escondido não aparece. [{ km, p: [lat, lon] }]
export function kmPoints(route, splits) {
  const segs = cleanRoute(route);
  if (!hasTime(segs) || !Array.isArray(splits) || !splits.length) return [];
  const out = [];
  let acc = 0;
  splits.forEach((sec, i) => {
    acc += sec;
    for (const seg of segs) {
      if (seg[0][2] > acc || seg.at(-1)[2] < acc) continue;
      const j = seg.findIndex(p => p[2] >= acc);
      const a = seg[Math.max(0, j - 1)];
      const b = seg[j];
      const f = b[2] === a[2] ? 0 : (acc - a[2]) / (b[2] - a[2]);
      out.push({ km: i + 1, p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f] });
      return;
    }
  });
  return out;
}

export const PACE_LEVELS = 5;
// Faixas de velocidade em relação à média da própria corrida: abaixo de 90%
// é o nível 0 (bem mais lento), 90–96% o 1, 96–104% o 2 (no ritmo da corrida),
// 104–110% o 3 e acima o 4 (bem mais rápido). Corrida de ritmo constante fica
// quase toda no nível do meio, em vez de virar um arco-íris de ruído.
const PACE_BANDS = [0.9, 0.96, 1.04, 1.1];
// Ritmo de cada pedaço do percurso em níveis 0 a 4 (PACE_BANDS). A velocidade
// de cada ponto é medida numa janela de ~100 m para o ruído do GPS não pintar
// tudo de colorido. Devolve trechos [{ level, pts }] prontos para desenhar, ou [] sem t.
export function paceRuns(route, windowM = 100) {
  const segs = cleanRoute(route);
  if (!hasTime(segs)) return [];
  const pieces = [];
  let totalD = 0;
  let totalT = 0;
  for (const seg of segs) {
    const cum = [0];
    for (let i = 1; i < seg.length; i++) cum.push(cum[i - 1] + haversineM(toDeg(seg[i - 1]), toDeg(seg[i])));
    totalD += cum.at(-1);
    totalT += seg.at(-1)[2] - seg[0][2];
    for (let i = 1; i < seg.length; i++) {
      let a = i - 1;
      let b = i;
      while ((cum[b] - cum[a]) < windowM && (a > 0 || b < seg.length - 1)) {
        if (a > 0) a--;
        if (b < seg.length - 1 && cum[b] - cum[a] < windowM) b++;
      }
      const dt = seg[b][2] - seg[a][2];
      const dd = cum[b] - cum[a];
      pieces.push({ seg, i, speed: dt > 0 ? dd / dt : null });
    }
  }
  const mean = totalT > 0 ? totalD / totalT : 0;
  if (!(mean > 0)) return [];
  const level = v => (v === null ? Math.floor(PACE_LEVELS / 2) : PACE_BANDS.filter(b => v / mean >= b).length);
  const out = [];
  for (const piece of pieces) {
    const lv = level(piece.speed);
    const last = out.at(-1);
    const from = piece.seg[piece.i - 1];
    const to = piece.seg[piece.i];
    if (last && last.level === lv && last.seg === piece.seg && last.pts.at(-1) === from) last.pts.push(to);
    else out.push({ level: lv, seg: piece.seg, pts: [from, to] });
  }
  return out.map(({ level: lv, pts }) => ({ level: lv, pts }));
}
