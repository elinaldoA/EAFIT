// Resultado de cada tiro do treino intervalado guiado (workout.js): { rep, s, m }
// com o número do tiro, o tempo (s) e a distância (m). Sem importações, para
// poder ser usado por runs.js, liveRun.js e pelas telas sem ciclo.

export const MAX_REPS_SAVED = 60;

// Resultado do tiro que acabou de terminar: { rep, s, m } ou null (a etapa não
// é um tiro, ou o tempo/distância passou muito do esperado, como quando o app
// ficou em segundo plano e o resultado não é confiável).
export function repResult(step, pos, elapsedS, meters) {
  if (!step || step.type !== 'work') return null;
  const s = Math.round(elapsedS - pos.startS);
  const m = Math.round(meters - pos.startM);
  const used = step.unit === 'm' ? m : s;
  if (!(s > 0) || !(m >= 0) || used > step.value * 1.5 + 5) return null;
  return { rep: step.rep, s, m };
}

// Lista vinda do aparelho ou do banco, só com tiros válidos e sem repetir o número.
export function cleanReps(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const r of list) {
    const rep = Math.round(Number(r?.rep));
    const s = Math.round(Number(r?.s));
    const m = Math.round(Number(r?.m));
    if (!(rep >= 1 && rep <= 99) || !(s > 0 && s <= 86400) || !(m >= 0 && m <= 100000) || seen.has(rep)) continue;
    seen.add(rep);
    out.push({ rep, s, m });
    if (out.length >= MAX_REPS_SAVED) break;
  }
  return out;
}

// Ritmo (s/km) do tiro; null sem distância medida (esteira ou sem GPS).
export const repPace = r => (r.m >= 50 && r.s > 0 ? Math.round(r.s / (r.m / 1000)) : null);

// { fastest, slowest, avg } em ritmo (s/km) e o número do tiro mais rápido; null sem ritmo.
export function repsSummary(reps) {
  const paced = cleanReps(reps).map(r => ({ rep: r.rep, pace: repPace(r), s: r.s, m: r.m })).filter(r => r.pace !== null);
  if (!paced.length) return null;
  const best = paced.reduce((a, b) => (b.pace < a.pace ? b : a));
  const totalM = paced.reduce((a, r) => a + r.m, 0);
  const totalS = paced.reduce((a, r) => a + r.s, 0);
  return { bestRep: best.rep, fastest: best.pace, slowest: Math.max(...paced.map(r => r.pace)), avg: Math.round(totalS / (totalM / 1000)), count: paced.length };
}

