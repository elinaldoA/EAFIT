import { haversineM } from './geoTrack';
import { cleanRoute } from './route';

// Editar o percurso de uma corrida já salva: cortar o começo ou o fim (esqueceu
// de parar o GPS) e juntar duas corridas do mesmo dia (a gravação caiu no meio).
// Funções puras: devolvem o que mudar na corrida (patch) e quem chama grava.

const SCALE = 1e5;
const deg = p => ({ lat: p[0] / SCALE, lon: p[1] / SCALE });
const timed = segs => segs.length > 0 && segs.every(seg => seg.every(p => p.length === 3));

// Distância acumulada de cada ponto desde o começo do percurso (somando os trechos).
function cumulative(segs) {
  let total = 0;
  const cum = segs.map(seg => seg.map((p, i) => {
    if (i) total += haversineM(deg(seg[i - 1]), deg(p));
    return total;
  }));
  return { cum, total };
}

// Comprimento do percurso desenhado, em m (0 sem percurso).
export const routeLengthM = route => cumulative(cleanRoute(route)).total;

// Só dá para cortar percurso com o tempo de cada ponto (corridas gravadas depois de nov/2026).
export const canCrop = run => timed(cleanRoute(run?.route)) && routeLengthM(run.route) >= 200;

// Corta `fromM` do começo e `toM` do fim do percurso (em m). Devolve { patch, removedM,
// removedS } ou { error }. O que sai do percurso sai também da distância e do tempo da
// corrida; os parciais por km e a subida por km deixam de valer e são apagados.
export function cropRun(run, fromM, toM) {
  const segs = cleanRoute(run?.route);
  if (!timed(segs)) return { error: 'sem-tempo' };
  const { cum, total } = cumulative(segs);
  const start = Math.max(0, Math.round(fromM) || 0);
  const end = total - Math.max(0, Math.round(toM) || 0);
  if (end - start < 100) return { error: 'curto-demais' };
  const kept = segs
    .map((seg, s) => seg.filter((_, i) => cum[s][i] >= start && cum[s][i] <= end))
    .filter(seg => seg.length >= 2);
  if (!kept.length) return { error: 'curto-demais' };
  const firstT = segs[0][0][2];
  const lastT = segs.at(-1).at(-1)[2];
  const keptFirstT = kept[0][0][2];
  const keptLastT = kept.at(-1).at(-1)[2];
  const removedM = Math.round(start + (total - Math.max(start, end)));
  const removedS = Math.max(0, keptFirstT - firstT) + Math.max(0, lastT - keptLastT);
  const distance_m = Math.max(0, Math.round(run.distance_m - removedM));
  const duration_s = Math.max(1, Math.round(run.duration_s - removedS));
  if (distance_m < 100) return { error: 'curto-demais' };
  return {
    patch: { route: kept, distance_m, duration_s, splits: [], km_elev: null, elev_gain_m: null },
    removedM,
    removedS,
  };
}

// Duas corridas do mesmo dia podem ser juntadas.
export const canMerge = (a, b) => !!a && !!b && a.client_id !== b.client_id && a.run_date === b.run_date;

const startOf = r => r.started_at || `${r.run_date}T12:00:00`;

// Junta duas corridas do mesmo dia numa só (a que começou antes fica com o registro,
// e a outra deve ser apagada por quem chama). Soma distância e tempo, emenda os
// percursos (trechos separados, sem ligar o fim de um ao começo do outro) e apaga
// parciais e subida por km, que não batem mais com a soma. Devolve { keep, drop, patch }
// ou { error }.
export function mergeRuns(a, b) {
  if (!canMerge(a, b)) return { error: 'nao-junta' };
  const [first, second] = startOf(a) <= startOf(b) ? [a, b] : [b, a];
  const r1 = cleanRoute(first.route);
  const r2 = cleanRoute(second.route);
  // O tempo de cada ponto conta desde o início da própria corrida: o da segunda segue o da primeira.
  const keepTime = (!r1.length || timed(r1)) && (!r2.length || timed(r2));
  const shift = first.duration_s;
  const route = [
    ...r1.map(seg => (keepTime ? seg : seg.map(p => [p[0], p[1]]))),
    ...r2.map(seg => seg.map(p => (keepTime ? [p[0], p[1], p[2] + shift] : [p[0], p[1]]))),
  ];
  const sum = (x, y) => (x == null || y == null ? null : x + y);
  const total = first.duration_s + second.duration_s;
  const weighted = (x, y) => (x == null || y == null ? null : Math.round((x * first.duration_s + y * second.duration_s) / total));
  const hr = first.hr && second.hr
    ? {
        avg: weighted(first.hr.avg, second.hr.avg),
        max: Math.max(first.hr.max, second.hr.max),
        ...(first.hr.z && second.hr.z ? { z: first.hr.z.map((v, i) => v + second.hr.z[i]) } : {}),
      }
    : null;
  const notes = [first.notes, second.notes].filter(Boolean).join('\n').slice(0, 500) || null;
  return {
    keep: first,
    drop: second,
    patch: {
      distance_m: first.distance_m + second.distance_m,
      duration_s: total,
      splits: [],
      km_elev: null,
      route,
      gps: !!(first.gps && second.gps),
      elev_gain_m: sum(first.elev_gain_m, second.elev_gain_m),
      cadence: weighted(first.cadence, second.cadence),
      hr,
      effort: Math.max(first.effort || 0, second.effort || 0) || null,
      notes,
      title: first.title || second.title || null,
      kind: first.kind === second.kind ? first.kind : 'livre',
      shoe_id: first.shoe_id || second.shoe_id || null,
    },
  };
}
