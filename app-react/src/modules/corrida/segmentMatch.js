import { haversineM } from './geoTrack';
import { cleanRoute } from './route';

// Segmentos: um trecho de percurso (largada, chegada e o desenho) que várias
// corridas podem repetir. Aqui ficam as contas, todas puras: criar um segmento a
// partir de um trecho de uma corrida e achar o tempo de uma corrida nele.
//
// O tempo vem do percurso com o tempo de cada ponto (segundos de corrida, sem as
// pausas), então só corridas gravadas depois de nov/2026 entram.

const SCALE = 1e5;
const deg = p => ({ lat: p[0] / SCALE, lon: p[1] / SCALE });
const dist = (a, b) => haversineM(deg(a), deg(b));

export const MIN_SEGMENT_M = 100;
export const MAX_SEGMENT_M = 100000;
export const MAX_ROUTE_POINTS = 300;
// Raio em volta da largada e da chegada para a corrida "passar" por elas.
export const GATE_M = 35;
// A distância andada entre as duas pontas pode variar nesta faixa em relação ao
// segmento (atalho muito curto ou volta muito maior não vale).
const LEN_MIN = 0.85;
const LEN_MAX = 1.2;

// Pontos do percurso em fila, com a distância acumulada: [{ p: [lat, lon], t, cum }].
// [] sem o tempo nos pontos.
export function pathPoints(route) {
  const segs = cleanRoute(route);
  if (!segs.length || !segs.every(seg => seg.every(p => p.length === 3))) return [];
  const out = [];
  let cum = 0;
  let prev = null;
  for (const seg of segs) {
    for (const p of seg) {
      if (prev) cum += dist(prev, p);
      out.push({ p: [p[0], p[1]], t: p[2], cum });
      prev = p;
    }
  }
  return out;
}

export const canMakeSegment = run => pathPoints(run?.route).length >= 2 && (pathPoints(run.route).at(-1).cum >= MIN_SEGMENT_M);

// Comprimento do percurso desenhado de uma corrida, em m.
export const pathLengthM = route => pathPoints(route).at(-1)?.cum || 0;

// Segmento (para gravar) com o trecho de `fromM` a `toM` do percurso da corrida, em
// metros desde o começo do desenho. { error } se o trecho for curto ou longo demais.
export function segmentFromRun(run, fromM, toM) {
  const pts = pathPoints(run?.route);
  if (pts.length < 2) return { error: 'sem-tempo' };
  const a = Math.max(0, fromM);
  const b = Math.min(pts.at(-1).cum, toM);
  const len = Math.round(b - a);
  if (len < MIN_SEGMENT_M) return { error: 'curto-demais' };
  if (len > MAX_SEGMENT_M) return { error: 'longo-demais' };
  const part = pts.filter(x => x.cum >= a && x.cum <= b);
  if (part.length < 2) return { error: 'curto-demais' };
  const step = Math.ceil(part.length / (MAX_ROUTE_POINTS - 1));
  const route = part.filter((_, i) => i % step === 0 || i === part.length - 1).map(x => x.p);
  return { route, distance_m: len };
}

// Ponto de menor distância ao portão dentro de cada grupo de pontos seguidos a menos
// de GATE_M dele: [{ i, d }] em ordem. Uma passagem pelo portão vira um só candidato.
function gatePasses(pts, gate) {
  const out = [];
  let best = null;
  pts.forEach((x, i) => {
    const d = dist(x.p, gate);
    if (d <= GATE_M) {
      if (!best || d < best.d) best = { i, d };
    } else if (best) {
      out.push(best);
      best = null;
    }
  });
  if (best) out.push(best);
  return out;
}

// Tempo da corrida no segmento: { seconds } da passagem mais rápida, ou null se a
// corrida não passou pelas duas pontas na ordem certa com a distância esperada.
// segment: { route: [[lat, lon]...], distance_m }.
export function findEffort(segment, run) {
  const route = segment?.route;
  if (!Array.isArray(route) || route.length < 2) return null;
  const pts = pathPoints(run?.route);
  if (pts.length < 2) return null;
  const start = route[0];
  const end = route.at(-1);
  const L = segment.distance_m;
  // Caixa do percurso da corrida: sem as pontas por perto nem calcula.
  const near = gate => pts.some(x => Math.abs(x.p[0] - gate[0]) < 0.0006 * SCALE && Math.abs(x.p[1] - gate[1]) < 0.0006 * SCALE);
  if (!near(start) || !near(end)) return null;
  const starts = gatePasses(pts, start);
  const ends = gatePasses(pts, end);
  let best = null;
  for (const s of starts) {
    const e = ends.find(x => x.i > s.i && (pts[x.i].cum - pts[s.i].cum) >= L * LEN_MIN && (pts[x.i].cum - pts[s.i].cum) <= L * LEN_MAX);
    if (!e) continue;
    const seconds = pts[e.i].t - pts[s.i].t;
    if (seconds >= 5 && (best === null || seconds < best.seconds)) best = { seconds };
  }
  return best;
}

// Esforços que faltam calcular: para cada corrida salva (com id) e cada segmento que
// ainda não tem esforço dela em `known` (Set de "segmento:corrida"), o tempo, se passou.
// [{ segment_id, run_id, seconds, run_date }]
export function newEfforts(segments, runs, known = new Set()) {
  const out = [];
  for (const run of runs) {
    if (!run.id || run.pending) continue;
    for (const seg of segments) {
      if (known.has(`${seg.id}:${run.id}`)) continue;
      const e = findEffort(seg, run);
      if (e) out.push({ segment_id: seg.id, run_id: run.id, seconds: e.seconds, run_date: run.run_date });
    }
  }
  return out;
}
