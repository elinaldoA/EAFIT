import { estimateOneRepMax } from './records';

// Histórico de um exercício por sessão, a partir das séries concluídas
// ({ carga, reps, workout_date, set_number? }): maior carga do dia, as reps
// feitas nela, volume (Σ carga × reps) e melhor 1RM estimado. Do mais recente
// para o mais antigo.
export function sessionsFromSets(sets, limit = 5) {
  const byDate = new Map();
  (sets || []).forEach(s => {
    const carga = parseFloat(s.carga);
    if (!Number.isFinite(carga)) return;
    const reps = parseInt(s.reps, 10);
    const cur = byDate.get(s.workout_date) || { date: s.workout_date, topCarga: 0, topReps: null, volume: 0, oneRm: null, sets: 0 };
    cur.sets += 1;
    if (Number.isFinite(reps)) cur.volume += carga * reps;
    if (carga > cur.topCarga || (carga === cur.topCarga && Number.isFinite(reps) && reps > (cur.topReps ?? 0))) {
      cur.topCarga = carga;
      cur.topReps = Number.isFinite(reps) ? reps : cur.topReps;
    }
    const orm = estimateOneRepMax(carga, reps);
    if (orm !== null && (cur.oneRm === null || orm > cur.oneRm)) cur.oneRm = orm;
    byDate.set(s.workout_date, cur);
  });
  return [...byDate.values()]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, limit)
    .map(x => ({ ...x, volume: Math.round(x.volume), oneRm: x.oneRm === null ? null : Math.round(x.oneRm * 10) / 10 }));
}

// Séries da sessão mais recente, na ordem das séries: [{ carga, reps }].
// Alimenta "repetir o último treino" (uma linha por série, Série 1 primeiro).
export function lastSessionSets(sets, beforeDate = null) {
  const valid = (sets || []).filter(s => Number.isFinite(parseFloat(s.carga)) && (!beforeDate || s.workout_date < beforeDate));
  if (!valid.length) return [];
  const last = valid.reduce((max, s) => (s.workout_date > max ? s.workout_date : max), valid[0].workout_date);
  return valid
    .filter(s => s.workout_date === last)
    .sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0))
    .map(s => ({ carga: parseFloat(s.carga), reps: Number.isFinite(parseInt(s.reps, 10)) ? parseInt(s.reps, 10) : null }));
}
