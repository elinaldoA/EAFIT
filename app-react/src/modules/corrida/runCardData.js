import { computeRunStats, bestEffort, EFFORT_KM, paceSeconds, formatKm, formatPace, formatClock } from './runs';
import { newAchievements } from './runReadings';
import { cleanRoute } from './route';
import { t } from '../../lib/i18n';

// Dados extras dos cartões de corrida (modules/corrida/runShareCard.js): selos
// de recorde e conquista, gráfico de ritmo por km, subida e cadência, e o
// percurso pintado pela subida de cada km. Tudo puro, sem desenhar nada.

// ---- Selos de recorde e conquista ------------------------------------------

const sameRun = (a, b) => (!!a.client_id && a.client_id === b.client_id) || (!!a.id && a.id === b.id);

// As corridas que vieram antes de `run` (as de depois não contam como recorde batido).
export function previousRuns(run, runs) {
  return (runs || []).filter(r => !sameRun(r, run)
    && (r.run_date < run.run_date || (r.run_date === run.run_date && !!r.started_at && !!run.started_at && r.started_at < run.started_at)));
}

const gainText = s => (s < 60 ? t('{v1} s', { v1: s }) : formatClock(s));

// Selos [{ icon, text }] do que a corrida bateu: recordes de distância, ritmo e
// melhor tempo em 1, 5, 10 e 21 km (com quanto melhorou) e conquistas novas.
// `runs` é a lista já carregada: sem ela (ou vazia) não dá para afirmar nada.
export function badgesFor(run, runs, max = 3) {
  if (!run || !Array.isArray(runs) || !runs.length) return [];
  const prev = previousRuns(run, runs);
  const out = [];
  if (prev.length) {
    const before = computeRunStats(prev, run.run_date, 1);
    for (const k of [...EFFORT_KM].reverse()) {
      const e = bestEffort(run.splits, k);
      if (e !== null && before.efforts[k] !== null && e < before.efforts[k]) {
        out.push({ icon: '🥇', text: t('Melhor {v1} km: {v2} ({v3} mais rápido)', { v1: k, v2: formatClock(e), v3: gainText(before.efforts[k] - e) }) });
      }
    }
    if (run.distance_m > before.longestM) {
      out.push({ icon: '🏆', text: t('Maior distância: {v1} km', { v1: formatKm(run.distance_m) }) });
    }
    const pace = paceSeconds(run.duration_s, run.distance_m);
    if (pace !== null && before.bestPace !== null && pace < before.bestPace) {
      out.push({ icon: '⚡', text: t('Melhor ritmo: {v1}/km ({v2} mais rápido)', { v1: formatPace(pace), v2: gainText(before.bestPace - pace) }) });
    }
  }
  for (const a of newAchievements(prev, [...prev, run])) out.push({ icon: a.icon, text: a.title });
  return out.slice(0, max);
}

// ---- Gráfico de ritmo por km -----------------------------------------------

// Barras do gráfico: uma por km completo, a mais rápida com altura cheia.
// { bars: [{ km, sec, h, best }], best: { km, sec }, alt } com h de 0,3 a 1 e
// alt = altitude acumulada a cada km (n + 1 pontos, em m) ou null sem subida
// por km. null com menos de 2 km.
export function splitsChart(splits, kmElev) {
  if (!Array.isArray(splits) || splits.length < 2) return null;
  const secs = splits.map(Number);
  const fast = Math.min(...secs);
  const slow = Math.max(...secs);
  const bestIndex = secs.indexOf(fast);
  const bars = secs.map((sec, i) => ({
    km: i + 1,
    sec,
    h: slow === fast ? 0.7 : 0.3 + (0.7 * (slow - sec)) / (slow - fast),
    best: i === bestIndex,
  }));
  let alt = null;
  if (Array.isArray(kmElev) && kmElev.length >= secs.length) {
    alt = [0];
    for (let i = 0; i < secs.length; i++) alt.push(alt[i] + (kmElev[i][0] || 0) - (kmElev[i][1] || 0));
    if (Math.max(...alt) - Math.min(...alt) < 3) alt = null;
  }
  return { bars, best: { km: bestIndex + 1, sec: fast }, alt };
}

// Subida e cadência da corrida, em texto, quando existem.
export function extrasOf(run) {
  const out = [];
  if (run?.elev_gain_m > 0) out.push(t('↗ {v1} m de subida', { v1: run.elev_gain_m }));
  if (run?.cadence > 0) out.push(t('👣 {v1} passos/min', { v1: run.cadence }));
  return out;
}

// ---- Percurso pintado por km -------------------------------------------------

// Cor de cada nível, de 0 (mais lento ou descida) a 4 (mais rápido ou subida íngreme).
export const LEVEL_COLORS = ['#38bdf8', '#34d399', '#facc15', '#fb923c', '#ef4444'];

// Saldo (subida − descida, em m) de um km → nível: descida, plano e três faixas de subida.
const netLevel = n => (n <= -8 ? 0 : n < 8 ? 1 : n < 20 ? 2 : n < 40 ? 3 : 4);

// Velocidade do km contra a média da corrida → nível (mesmas faixas de route.paceRuns).
const PACE_BANDS = [0.9, 0.96, 1.04, 1.1];

// Distância aproximada entre dois pontos [lat, lon] (inteiros de 1e-5 grau), em m.
function gap(a, b) {
  const k = 1e-5 * 111320;
  const dy = (b[0] - a[0]) * k;
  const dx = (b[1] - a[1]) * k * Math.cos(((a[0] + b[0]) / 2) * 1e-5 * (Math.PI / 180));
  return Math.hypot(dx, dy);
}

// Trechos [{ level, pts }] do percurso, cada ponto com o nível do km em que cai.
// Com o tempo nos pontos, o km vem do tempo contra o fim de cada km. Nas corridas
// antigas (pontos só com [lat, lon]) é aproximado: a fração do caminho já andada
// vira o km (as pontas cortadas por privacidade deslocam um pouco as trocas).
// `levels` tem um nível por km completo.
function kmRuns(route, splits, levels) {
  const segs = cleanRoute(route);
  if (!segs.length) return [];
  const timed = segs.every(seg => seg.every(p => p.length === 3));
  const ends = [];
  let acc = 0;
  for (const s of splits) { acc += s; ends.push(acc); }
  let total = 0;
  if (!timed) segs.forEach(seg => seg.forEach((p, i) => { if (i) total += gap(seg[i - 1], p); }));
  if (!timed && !(total > 0)) return [];
  const out = [];
  let walked = 0;
  for (const seg of segs) {
    let cur = null;
    seg.forEach((p, i) => {
      if (i) walked += gap(seg[i - 1], p);
      const km = timed ? ends.findIndex(e => p[2] <= e) : Math.min(levels.length - 1, Math.floor((walked / total) * levels.length));
      // Depois do último km completo não há dado: segue com o nível que vinha.
      const level = km >= 0 ? levels[km] : (cur ? cur.level : 1);
      if (cur && cur.level === level) cur.pts.push(p);
      else {
        const last = cur ? cur.pts.at(-1) : null;
        cur = { level, pts: last ? [last, p] : [p] };
        out.push(cur);
      }
    });
  }
  return out.filter(r => r.pts.length >= 2);
}

// Percurso pintado pelo saldo de subida de cada km. [] sem os parciais ou sem a
// subida por km.
export function elevRuns(route, splits, kmElev) {
  if (!Array.isArray(splits) || !splits.length || !Array.isArray(kmElev) || kmElev.length < splits.length) return [];
  return kmRuns(route, splits, splits.map((_, i) => netLevel((kmElev[i][0] || 0) - (kmElev[i][1] || 0))));
}

// Percurso pintado pelo ritmo de cada km, para as corridas em que os pontos não
// têm tempo (route.paceRuns, mais fino, só funciona com ele). [] com menos de 2 km.
export function paceKmRuns(route, splits) {
  if (!Array.isArray(splits) || splits.length < 2) return [];
  const mean = splits.reduce((a, b) => a + b, 0) / splits.length;
  return kmRuns(route, splits, splits.map(s => PACE_BANDS.filter(b => mean / s >= b).length));
}
