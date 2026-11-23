import { haversineM } from './geoTrack';
import { cleanRoute } from './route';

// Flyby: rever duas corridas que aconteceram ao mesmo tempo (a sua e a de um
// amigo, ou as de dois amigos), com os dois pontos andando no mapa. Funciona com
// o percurso que tem o tempo de cada ponto (segundos de corrida desde o início) e
// com a hora de começo das corridas; as pausas deslocam um pouco o encontro.

const SCALE = 1e5;
const deg = p => ({ lat: p[0] / SCALE, lon: p[1] / SCALE });
const timed = segs => segs.length > 0 && segs.every(seg => seg.every(p => p.length === 3));

export const STEP_S = 5;
// Dois corredores a menos que isso um do outro estão "juntos".
export const TOGETHER_M = 50;
// Janela mínima em comum e distância mínima entre os dois para valer o flyby.
export const MIN_WINDOW_S = 60;
export const MAX_MEET_M = 500;

const startMs = r => Date.parse(r.started_at || '');

// Segundos de corrida do percurso: do primeiro ao último ponto.
function span(segs) {
  return { from: segs[0][0][2], to: segs.at(-1).at(-1)[2] };
}

// Posição [lat, lon] (inteiros de 1e-5 grau) no segundo `t` de corrida; null antes do
// começo ou depois do fim. Numa pausa (entre trechos) fica parado no último ponto.
export function positionAt(segs, t) {
  const { from, to } = span(segs);
  if (t < from || t > to) return null;
  let held = segs[0][0];
  for (const seg of segs) {
    const a = seg[0][2];
    const b = seg.at(-1)[2];
    if (t < a) return [held[0], held[1]];
    if (t <= b) {
      const j = seg.findIndex(p => p[2] >= t);
      const p1 = seg[j];
      const p0 = seg[Math.max(0, j - 1)];
      const f = p1[2] === p0[2] ? 0 : (t - p0[2]) / (p1[2] - p0[2]);
      return [p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f];
    }
    held = seg.at(-1);
  }
  return [held[0], held[1]];
}

// Comparação de duas corridas { started_at, route }: { startMs, windowS, minM, togetherS,
// togetherM, samples: [{ s, a, b, d }] } (s = segundos desde o começo da janela em comum,
// a e b = posições, d = distância entre os dois em m), ou null se não há janela em comum
// de pelo menos MIN_WINDOW_S, se faltar o tempo nos pontos ou se nunca chegaram a
// MAX_MEET_M um do outro.
export function flybyBetween(a, b) {
  const sa = cleanRoute(a?.route);
  const sb = cleanRoute(b?.route);
  if (!timed(sa) || !timed(sb)) return null;
  const startA = startMs(a);
  const startB = startMs(b);
  if (!Number.isFinite(startA) || !Number.isFinite(startB)) return null;
  const aSpan = span(sa);
  const bSpan = span(sb);
  // Cada corrida ocupa [início + primeiro t, início + último t] do relógio.
  const from = Math.max(startA + aSpan.from * 1000, startB + bSpan.from * 1000);
  const to = Math.min(startA + aSpan.to * 1000, startB + bSpan.to * 1000);
  const windowS = Math.floor((to - from) / 1000);
  if (windowS < MIN_WINDOW_S) return null;

  const samples = [];
  let minM = Infinity;
  let togetherS = 0;
  let togetherM = 0;
  let prevA = null;
  for (let s = 0; s <= windowS; s += STEP_S) {
    const at = from + s * 1000;
    const pa = positionAt(sa, (at - startA) / 1000);
    const pb = positionAt(sb, (at - startB) / 1000);
    if (!pa || !pb) continue;
    const d = Math.round(haversineM(deg(pa), deg(pb)));
    minM = Math.min(minM, d);
    if (d <= TOGETHER_M) {
      togetherS += STEP_S;
      if (prevA) togetherM += haversineM(deg(prevA), deg(pa));
    }
    prevA = pa;
    samples.push({ s, a: pa, b: pb, d });
  }
  if (!samples.length || minM > MAX_MEET_M) return null;
  return { startMs: from, windowS, minM, togetherS, togetherM: Math.round(togetherM), samples };
}

// Corridas de `list` que têm flyby com `run` (outro id, com percurso e hora), da que
// ficou mais tempo junto para a que menos: [{ other, flyby }].
export function flybyCandidates(run, list) {
  if (!run || !timed(cleanRoute(run.route))) return [];
  return list
    .filter(o => o !== run && o.id !== run.id && o.route?.length)
    .map(other => ({ other, flyby: flybyBetween(run, other) }))
    .filter(x => x.flyby)
    .sort((x, y) => y.flyby.togetherS - x.flyby.togetherS || x.flyby.minM - y.flyby.minM);
}
