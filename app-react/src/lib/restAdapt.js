// Descanso adaptado ao esforço da série (RIR = reps que sobraram): série até a
// falha pede mais descanso, série leve pede menos. Só mexe em descansos de 60 s
// ou mais (abaixo disso é bi-set/circuito, onde o ritmo é parte do treino).
export const HARD_EXTRA_S = 30;
export const EASY_CUT_S = 15;
const MIN_REST_S = 45;

export function adaptRest(baseSeconds, rir) {
  if (!(baseSeconds >= 60)) return baseSeconds;
  const n = rir === null || rir === undefined || rir === '' ? NaN : Number(rir);
  if (!Number.isFinite(n)) return baseSeconds;
  if (n === 0) return baseSeconds + HARD_EXTRA_S;
  if (n >= 3) return Math.max(MIN_REST_S, baseSeconds - EASY_CUT_S);
  return baseSeconds;
}

// Diferença (em segundos) a aplicar num descanso já em andamento quando o RIR
// da série é anotado depois do toque no ✓.
export function restDelta(baseSeconds, prevRir, nextRir) {
  return adaptRest(baseSeconds, nextRir) - adaptRest(baseSeconds, prevRir);
}
