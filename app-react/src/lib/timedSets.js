// Itens do plano com séries medidas em segundos (prancha, hollow hold, L-sit,
// farmer walk): o `reps` do plano vem como '40s', '20-30s' ou '30s cada lado'.
// A duração de cada série fica em exercise_sets.duracao_s (reps fica nulo).

const TIMED_RE = /^\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*(?:segundos?|seg|s)\b/i;

export function isTimedItem(ex) {
  return parseInt(ex?.series, 10) > 0 && TIMED_RE.test(String(ex?.reps ?? ''));
}

// Meta da série em segundos (o teto, se for faixa); null se não for por tempo.
export function parsePlannedSeconds(reps) {
  const m = String(reps ?? '').match(TIMED_RE);
  if (!m) return null;
  return parseInt(m[2] ?? m[1], 10);
}

// Aceita vírgula decimal; vazio/inválido/negativo/acima de 1h vira null.
export function toSeconds(val) {
  const n = parseFloat(String(val ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n <= 3600 ? Math.round(n) : null;
}

// 40 -> '40s'; 65 -> '1:05'.
export function formatSeconds(sec) {
  const n = toSeconds(sec);
  if (n === null) return '';
  if (n < 60) return `${n}s`;
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}
