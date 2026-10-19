import { getDateForWeekday } from './utils';
import { isCardioItem } from './cardio';

// Séries de aquecimento antes das de trabalho. Quantas: plan_exercises.aquecimento
// (0 a 3); nulo = automático, 2 no primeiro exercício de força do dia.
// Ficam só no aparelho (chave warm_<data>_<exercício>_<n>): não sobem para
// exercise_sets, então não entram no volume, nas séries do treino nem nos
// recordes — e a data na chave faz o check expirar sozinho na semana seguinte.

const AUTO_FIRST_EXERCISE = 2;
const MAX_WARMUP = 3;

// % da carga de trabalho e reps de cada série, por quantidade.
const SCHEMES = {
  1: [[0.6, 8]],
  2: [[0.5, 10], [0.7, 5]],
  3: [[0.4, 10], [0.6, 6], [0.8, 3]],
};

export function warmupCount(ex, indexInDay) {
  if (!ex || isCardioItem(ex) || !(parseInt(ex.series, 10) > 0)) return 0;
  const set = Number(ex.aquecimento);
  if (ex.aquecimento !== null && ex.aquecimento !== undefined && ex.aquecimento !== '' && Number.isInteger(set)) {
    return Math.max(0, Math.min(MAX_WARMUP, set));
  }
  return indexInDay === 0 ? AUTO_FIRST_EXERCISE : 0;
}

// Arredonda para baixo em 2,5 kg (o par de anilhas mais leve comum); abaixo
// de 2,5 kg não há o que sugerir e a série sai sem carga ("leve").
function roundLoad(kg) {
  const r = Math.floor(kg / 2.5) * 2.5;
  return r >= 2.5 ? r : null;
}

// [{ n, pct, reps, carga }] — carga null quando ainda não há carga de trabalho
// (primeira vez no exercício) ou ela é leve demais para fracionar.
export function warmupSets(count, workKg) {
  const scheme = SCHEMES[count] || [];
  const work = parseFloat(String(workKg ?? '').replace(',', '.'));
  return scheme.map(([pct, reps], i) => ({
    n: i + 1,
    pct: Math.round(pct * 100),
    reps,
    carga: Number.isFinite(work) && work > 0 ? roundLoad(work * pct) : null,
  }));
}

export function warmupKey(dia, nome, n) {
  return `warm_${getDateForWeekday(dia)}_${nome}_${n}`;
}

export function isWarmupDone(dia, nome, n) {
  try { return localStorage.getItem(warmupKey(dia, nome, n)) === 'true'; } catch { return false; }
}

export function setWarmupDone(dia, nome, n, done) {
  try {
    if (done) localStorage.setItem(warmupKey(dia, nome, n), 'true');
    else localStorage.removeItem(warmupKey(dia, nome, n));
    pruneOldWarmups();
  } catch { /* sem armazenamento: o check só não persiste */ }
}

// Apaga checks de aquecimento de outras semanas (as datas da semana atual ficam).
function pruneOldWarmups() {
  const keep = new Set(['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'].map(d => `warm_${getDateForWeekday(d)}_`));
  const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
  keys.forEach(k => {
    if (k?.startsWith('warm_') && ![...keep].some(p => k.startsWith(p))) localStorage.removeItem(k);
  });
}
