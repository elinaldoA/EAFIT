import { db } from './supabase';

const ERRORS = {
  not_authorized: 'Você não tem vínculo ativo com este aluno.',
  invalid_body: 'Escreva a anotação (até 1000 caracteres).',
  invalid_goals: 'Confira a meta: 1 a 7 treinos por semana e peso entre 30 e 300 kg.',
};

export function friendlyInsightError(err) {
  const msg = String(err?.message || '');
  const key = Object.keys(ERRORS).find(k => msg.includes(k));
  return key ? ERRORS[key] : 'Não foi possível concluir. Tente de novo.';
}

const num = v => (v === null || v === undefined || v === '' ? null : Number(v));

// Agrupa as séries de cada sessão por exercício e compara a carga máxima com a
// da sessão anterior que teve o mesmo exercício. `sessions` do mais recente
// ao mais antigo (como vem de trainer_client_sessions).
export function buildSessions(sessions) {
  const lastTop = new Map(); // exercício -> carga máxima na sessão mais antiga já vista (varrendo do fim)
  const ordered = [...sessions].reverse(); // do mais antigo ao mais recente

  const enriched = ordered.map(s => {
    const byEx = new Map();
    for (const set of s.sets || []) {
      if (!byEx.has(set.exercise)) byEx.set(set.exercise, []);
      byEx.get(set.exercise).push({ n: set.n, carga: num(set.carga), reps: num(set.reps) });
    }
    const exercises = [...byEx.entries()].map(([name, sets]) => {
      const loads = sets.map(x => x.carga).filter(v => Number.isFinite(v) && v > 0);
      const top = loads.length ? Math.max(...loads) : null;
      const prevTop = lastTop.has(name) ? lastTop.get(name) : null;
      const delta = top !== null && prevTop !== null ? Math.round((top - prevTop) * 10) / 10 : null;
      if (top !== null) lastTop.set(name, top);
      return { name, sets, top, prevTop, delta };
    });
    return {
      id: s.id, date: s.date, day: s.day, completed: !!s.completed,
      duration: num(s.duration), rating: num(s.rating), notes: s.notes || '',
      exercises,
      improved: exercises.filter(e => e.delta !== null && e.delta > 0).length,
      dropped: exercises.filter(e => e.delta !== null && e.delta < 0).length,
    };
  });

  return enriched.reverse();
}

// "26×10 · 26×9" (ou só reps quando não há carga).
export function formatSets(sets) {
  return sets
    .map(x => {
      const reps = Number.isFinite(x.reps) ? x.reps : '?';
      return Number.isFinite(x.carga) && x.carga > 0 ? `${String(x.carga).replace('.', ',')}×${reps}` : `${reps} reps`;
    })
    .join(' · ');
}

export function formatDurationMin(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

// ---- RPCs ------------------------------------------------------------------
export async function fetchClientSessions(clientId, limit = 12) {
  const { data, error } = await db.rpc('trainer_client_sessions', { p_client: clientId, p_limit: limit });
  if (error) throw error;
  return data || [];
}

export async function fetchNotes(clientId) {
  const { data, error } = await db.rpc('trainer_client_notes', { p_client: clientId });
  if (error) throw error;
  return (data || []).map(r => ({ id: r.note_id, body: r.note_body, at: r.note_at }));
}

export async function addNote(clientId, body) {
  const { error } = await db.rpc('trainer_add_note', { p_client: clientId, p_body: body });
  if (error) throw error;
}

export async function deleteNote(id) {
  const { error } = await db.rpc('trainer_delete_note', { p_id: id });
  if (error) throw error;
}

export async function fetchGoals(clientId) {
  const { data, error } = await db.rpc('trainer_client_goals', { p_client: clientId });
  if (error) throw error;
  const row = (data || [])[0];
  return row ? { weekly: row.goal_weekly, weight: num(row.goal_weight), note: row.goal_note || '', at: row.goal_at } : null;
}

export async function setGoals(clientId, { weekly, weight, note }) {
  const { error } = await db.rpc('trainer_set_goals', {
    p_client: clientId, p_weekly: weekly, p_weight: weight, p_note: note || null,
  });
  if (error) throw error;
}

// Lado do aluno: metas que o personal definiu.
export async function fetchMyGoals() {
  const { data, error } = await db.rpc('my_trainer_goals');
  if (error) throw error;
  const row = (data || [])[0];
  return row ? { weekly: row.goal_weekly, weight: num(row.goal_weight), note: row.goal_note || '', at: row.goal_at } : null;
}

// ---- Sugestão de progressão de carga ---------------------------------------
// Sem plano na mão (as sessões só trazem o que foi feito), a regra usa só o
// histórico: "subir" quando nas duas últimas vezes o aluno fez a mesma carga
// máxima e, nas séries com ela, chegou à média de REPS_TO_PROGRESS repetições
// ou mais; "estagnado" quando repetiu a carga máxima nas 3 últimas vezes sem
// ganhar repetições. É uma sugestão: quem decide é o personal.
export const REPS_TO_PROGRESS = 12;

export function nextLoad(top) {
  const step = top >= 40 ? 2.5 : top >= 15 ? 2 : 1;
  return Math.round((top + step) * 10) / 10;
}

function avgRepsAtTop(e) {
  const reps = e.sets.filter(s => s.carga === e.top && Number.isFinite(s.reps)).map(s => s.reps);
  return reps.length ? reps.reduce((a, b) => a + b, 0) / reps.length : null;
}

// `sessions`: saída de buildSessions (da mais recente para a mais antiga).
export function progressionSuggestions(sessions) {
  const byName = new Map(); // exercício -> aparições com carga, da mais recente para a mais antiga
  for (const s of sessions) {
    for (const e of s.exercises) {
      if (e.top === null) continue;
      if (!byName.has(e.name)) byName.set(e.name, []);
      byName.get(e.name).push({ top: e.top, avg: avgRepsAtTop(e) });
    }
  }

  const out = [];
  for (const [name, seen] of byName) {
    const [a, b, c] = seen;
    if (a && b && a.top === b.top && a.avg !== null && b.avg !== null
        && a.avg >= REPS_TO_PROGRESS && b.avg >= REPS_TO_PROGRESS) {
      out.push({ name, kind: 'subir', top: a.top, next: nextLoad(a.top) });
    } else if (a && b && c && a.top === b.top && b.top === c.top
        && a.avg !== null && c.avg !== null && a.avg <= c.avg) {
      out.push({ name, kind: 'estagnado', top: a.top });
    }
  }
  return out.sort((x, y) => (x.kind === y.kind ? x.name.localeCompare(y.name) : x.kind === 'subir' ? -1 : 1));
}
