// "Correr de novo": o fantasma é uma corrida anterior. Durante a corrida o app
// compara o seu tempo com o que a corrida do fantasma tinha marcado na mesma
// distância (pelos tempos de cada km). Sem importações: usado por liveRun.js,
// pelo histórico e pela tela da corrida.

// Guardado na corrida em andamento (caber no localStorage): só o necessário.
export function ghostFrom(run) {
  if (!run || !(run.duration_s > 0) || !(run.distance_m >= 500)) return null;
  const splits = Array.isArray(run.splits) ? run.splits.filter(n => n > 0).map(Math.round) : [];
  return {
    id: run.client_id || null,
    title: String(run.title || '').slice(0, 80) || null,
    date: run.run_date || null,
    duration_s: Math.round(run.duration_s),
    distance_m: Math.round(run.distance_m),
    splits,
  };
}

// Pontos { m, s } (distância e tempo acumulados) da corrida do fantasma.
// Parciais incoerentes com o total (mais km que a distância, ou mais tempo que
// a duração) são ignorados: vale o ritmo médio em linha reta.
function marks(g) {
  const points = [{ m: 0, s: 0 }];
  let s = 0;
  g.splits.forEach((sec, i) => { s += sec; points.push({ m: (i + 1) * 1000, s }); });
  const last = points.at(-1);
  if (g.splits.length && (last.m > g.distance_m || last.s > g.duration_s)) return [{ m: 0, s: 0 }, { m: g.distance_m, s: g.duration_s }];
  if (g.distance_m > last.m) points.push({ m: g.distance_m, s: g.duration_s });
  else points[points.length - 1] = { m: last.m, s: Math.max(last.s, g.duration_s) };
  return points;
}

// Em que segundo da corrida do fantasma ele passava por `meters`. Depois do
// fim, segue no ritmo médio dela.
export function ghostTimeAt(g, meters) {
  if (!g || !(meters > 0)) return 0;
  const p = marks(g);
  for (let i = 1; i < p.length; i++) {
    if (meters <= p[i].m) {
      const span = p[i].m - p[i - 1].m;
      return p[i - 1].s + (span > 0 ? ((meters - p[i - 1].m) / span) * (p[i].s - p[i - 1].s) : 0);
    }
  }
  const end = p.at(-1);
  return end.s + (meters - end.m) * (g.duration_s / g.distance_m);
}

// Segundos à frente do fantasma (positivo) ou atrás (negativo).
export const ghostGapS = (g, elapsedS, meters) => Math.round(ghostTimeAt(g, meters) - elapsedS);

// ---- Mesma rota --------------------------------------------------------------

const DEG = 1e-5;           // a rota é guardada em inteiros de 1e-5 grau
const SAME_ROUTE_M = 300;   // centros a menos de 300 m
const SAME_DISTANCE = 0.1;  // distâncias com até 10% de diferença

function centroid(route) {
  let lat = 0;
  let lon = 0;
  let n = 0;
  for (const seg of Array.isArray(route) ? route : []) {
    for (const p of Array.isArray(seg) ? seg : []) {
      if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
      lat += p[0]; lon += p[1]; n++;
    }
  }
  return n ? { lat: (lat / n) * DEG, lon: (lon / n) * DEG } : null;
}

// Duas corridas parecem ser da mesma rota: percurso gravado dos dois lados,
// centro do desenho a poucos metros e distância parecida. É uma estimativa
// (a rota salva não tem o começo e o fim, por privacidade).
export function sameRoute(a, b) {
  if (!a || !b || !(a.distance_m > 0) || !(b.distance_m > 0)) return false;
  const ca = centroid(a.route);
  const cb = centroid(b.route);
  if (!ca || !cb) return false;
  if (Math.abs(a.distance_m - b.distance_m) / Math.max(a.distance_m, b.distance_m) > SAME_DISTANCE) return false;
  const dy = (ca.lat - cb.lat) * 111320;
  const dx = (ca.lon - cb.lon) * 111320 * Math.cos(((ca.lat + cb.lat) / 2) * Math.PI / 180);
  return Math.hypot(dx, dy) <= SAME_ROUTE_M;
}

// A corrida mais rápida da mesma rota de `run` (inclui a própria); run se não
// houver outra melhor.
export function bestOnSameRoute(runs, run) {
  let best = run;
  for (const r of runs) {
    if (r.client_id === run.client_id || r.pending || !(r.duration_s > 0)) continue;
    if (sameRoute(run, r) && r.duration_s < best.duration_s) best = r;
  }
  return best;
}

// Agrupa as corridas por rota (a mesma estimativa de sameRoute) para a lista
// "Minhas rotas". Só entram rotas feitas pelo menos `min` vezes; a mais feita
// primeiro, e a mais recente entre as empatadas. Cada grupo traz a corrida mais
// recente (`last`, que dá nome e desenho) e a mais rápida (`best`).
export function groupRoutes(runs, min = 2) {
  const groups = [];
  const sorted = (Array.isArray(runs) ? runs : [])
    .filter(r => !r.pending && r.duration_s > 0 && r.distance_m >= 1000 && centroid(r.route))
    .sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
  for (const run of sorted) {
    const group = groups.find(g => sameRoute(g.last, run));
    if (group) {
      group.runs.push(run);
      if (run.duration_s < group.best.duration_s) group.best = run;
    } else {
      groups.push({ last: run, best: run, runs: [run] });
    }
  }
  return groups
    .filter(g => g.runs.length >= min)
    .sort((a, b) => b.runs.length - a.runs.length || String(b.last.started_at).localeCompare(String(a.last.started_at)))
    .map(g => ({ ...g, count: g.runs.length }));
}
