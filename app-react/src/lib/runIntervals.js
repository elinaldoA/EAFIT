// Corre/caminha ("24min · 2min corre / 2min caminha"): em que fase do esquema
// o cronômetro está. Só vale para os itens de cardio com esse texto no plano.

const RE = /(\d+)\s*min\s*·\s*(\d+)\s*min\s*corre\s*\/\s*(\d+)\s*min\s*caminha/i;

// { total, run, walk } em minutos, ou null se o texto não é corre/caminha.
export function parseRunWalk(reps) {
  const m = String(reps ?? '').match(RE);
  if (!m) return null;
  const [total, run, walk] = [m[1], m[2], m[3]].map(n => parseInt(n, 10));
  return run > 0 && walk > 0 && total > 0 ? { total, run, walk } : null;
}

// Fase em `elapsedMs` de cronômetro: { phase: 'run' | 'walk' | 'done', remainingMs, round }.
// Começa correndo, alterna até completar `total` minutos; a última fase é cortada no total.
export function phaseAt(elapsedMs, { total, run, walk }) {
  const totalMs = total * 60000;
  if (elapsedMs >= totalMs) return { phase: 'done', remainingMs: 0, round: null };
  const runMs = run * 60000;
  const cycleMs = (run + walk) * 60000;
  const round = Math.floor(elapsedMs / cycleMs) + 1;
  const inCycle = elapsedMs % cycleMs;
  const phase = inCycle < runMs ? 'run' : 'walk';
  const phaseEnd = phase === 'run' ? runMs : cycleMs;
  return { phase, remainingMs: Math.min(phaseEnd - inCycle, totalMs - elapsedMs), round };
}
