import { db } from './supabase';

// Músculo principal escolhido pela pessoa para exercícios que a biblioteca não
// conhece (tabela exercise_muscles). Entra no mesmo mapa nome → músculo que o
// volume semanal já usa (muscleVolume.js) e vale mais que as palavras-chave.
const norm = nome => String(nome || '').replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '').trim().toLowerCase();

// Uma consulta por usuário: o volume e cada exercício aberto pedem o mesmo mapa.
let mineCache = null; // { userId, promise }

export function fetchMyMuscles(userId) {
  if (mineCache?.userId !== userId) {
    const promise = db.from('exercise_muscles').select('exercise_name, muscle').eq('user_id', userId)
      .then(({ data, error }) => {
        if (error) throw error;
        return new Map((data || []).map(r => [norm(r.exercise_name), r.muscle]));
      });
    promise.catch(() => { if (mineCache?.promise === promise) mineCache = null; });
    mineCache = { userId, promise };
  }
  return mineCache.promise;
}

// libraryMap: nome (minúsculo) → músculo ou null. A biblioteca manda: quem ela
// conhece (inclusive com null, como mobilidade) não é sobrescrito.
export function mergeCustomMuscles(libraryMap, custom) {
  const out = new Map(libraryMap || []);
  (custom || new Map()).forEach((muscle, nome) => { if (!out.has(nome)) out.set(nome, muscle); });
  return out;
}

// Linhas cruas, para o backup completo.
export async function fetchAllMuscleRows(userId) {
  const { data, error } = await db.from('exercise_muscles').select('exercise_name, muscle, updated_at').eq('user_id', userId).order('exercise_name');
  if (error) throw error;
  return data || [];
}

export async function saveMuscle(userId, nome, muscle) {
  const { error } = await db.from('exercise_muscles').upsert({
    user_id: userId, exercise_name: nome, muscle, updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  mineCache = null;
}

export { norm as muscleKey };
