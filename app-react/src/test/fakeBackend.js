// Servidor falso, com estado, no lugar do cliente do Supabase (`db`) nos testes
// de fluxo. Entende só o que o treino usa (workouts, exercise_sets,
// exercise_logs) e pode ser "derrubado": com `reachable = false` toda consulta
// devolve o mesmo erro que o supabase-js devolve sem rede, em vez de lançar.
export function createFakeBackend() {
  // writeLatencyMs: escrita lenta (rede ruim) — o servidor só aplica depois do prazo,
  // enquanto as leituras respondem na hora e enxergam o valor antigo nesse intervalo.
  const state = { reachable: true, writeLatencyMs: 0, workouts: [], sets: [], logs: [], seq: 1, calls: 0 };

  function from(table) {
    const q = { op: 'select', filters: [], patch: null, rows: null, onConflict: null, single: false };
    const match = (row) => q.filters.every(f => f(row));

    function exec() {
      state.calls += 1;
      if (!state.reachable) return { data: null, error: { message: 'Failed to fetch' } };

      if (table === 'workouts') {
        if (q.op === 'insert') {
          // Índice único do banco real: um treino por usuário e dia.
          if (state.workouts.some(w => w.user_id === q.rows.user_id && w.workout_date === q.rows.workout_date)) {
            return { data: null, error: { code: '23505', message: 'duplicate key value' } };
          }
          const row = { id: `w${state.seq++}`, completed: false, started_at: null, finished_at: null, duration_seconds: null, rating: null, notes: null, created_at: state.seq, ...q.rows };
          state.workouts.push(row);
          return { data: row, error: null };
        }
        if (q.op === 'update') {
          state.workouts.filter(match).forEach(w => Object.assign(w, q.patch));
          return { data: null, error: null };
        }
        const found = state.workouts.filter(match);
        return { data: q.single ? (found[0] ?? null) : found, error: null };
      }

      if (table === 'exercise_sets') {
        if (q.op === 'upsert') {
          const [a, b, c] = q.onConflict.split(',');
          const key = (r) => [r[a], r[b], r[c]].join('|');
          const existing = state.sets.find(s => key(s) === key(q.rows));
          if (existing) Object.assign(existing, q.rows);
          else state.sets.push({ ...q.rows });
          return { data: null, error: null };
        }
        const found = state.sets.filter(match);
        return { data: q.single ? (found[0] ?? null) : found, error: null };
      }

      if (table === 'exercise_logs') {
        if (q.op === 'insert') state.logs.push(...[].concat(q.rows));
        return { data: null, error: null };
      }
      return { data: [], error: null };
    }

    const b = {
      select() { return b; },
      eq(col, val) { if (!col.includes('.')) q.filters.push(r => r[col] === val); return b; },
      in(col, vals) { q.filters.push(r => vals.includes(r[col])); return b; },
      not(col, op, val) { if (op === 'is' && val === null) q.filters.push(r => r[col] !== null && r[col] !== undefined); return b; },
      order() { return b; },
      limit() { return b; },
      maybeSingle() { q.single = true; return b; },
      single() { q.single = true; return b; },
      update(patch) { q.op = 'update'; q.patch = patch; return b; },
      insert(rows) { q.op = 'insert'; q.rows = rows; return b; },
      upsert(row, opts) { q.op = 'upsert'; q.rows = row; q.onConflict = opts.onConflict; return b; },
      then(res, rej) {
        const slow = q.op !== 'select' && state.writeLatencyMs > 0;
        const run = slow ? new Promise(r => setTimeout(() => r(exec()), state.writeLatencyMs)) : Promise.resolve(exec());
        return run.then(res, rej);
      },
    };
    return b;
  }

  return { db: { from }, state };
}
