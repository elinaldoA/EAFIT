import { db } from './supabase';
import { allowedNiveis } from '../data/exerciseLibrary';

import { locale } from './i18n';
// Troca de exercício "geral": qualquer exercício do plano pode ser trocado por
// outro da biblioteca (public.exercise_library) do mesmo grupo muscular e tipo,
// respeitando o nível do usuário e evitando o que já está no dia e o que já
// causou dor forte/lesão pra ele. (A troca por dor com alternativa fixa em
// getSaferAlternative continua existindo e é independente desta.)

// Compara nomes sem o emoji de prefixo dos exercícios de pós-treino.
export function normalizeName(name) {
  return String(name || '').replace(/^[^\p{L}\p{N}]+/u, '').trim().toLowerCase();
}

export function findLibraryRow(library, name) {
  const key = normalizeName(name);
  return (library || []).find(r => normalizeName(r.nome) === key) || null;
}

// Alternativas pro exercício `current`: mesmo grupo e tipo, só força, nível
// permitido, fora do dia e fora da lista de evitar. Mesmo equipamento primeiro
// (a troca mais natural), depois ordem alfabética.
export function pickAlternatives({ current, library, nivel, dayNames = [], avoidNames = [], limit = 6 }) {
  const row = findLibraryRow(library, current?.nome);
  if (!row) return { known: false, options: [] };

  const blocked = new Set([current.nome, ...dayNames, ...avoidNames].map(normalizeName));
  const allowed = allowedNiveis(nivel);

  const options = (library || [])
    .filter(r => r.grupo_muscular === row.grupo_muscular
      && r.tipo === row.tipo
      && !r.is_post_workout
      && allowed.includes(r.nivel_minimo)
      && !blocked.has(normalizeName(r.nome)))
    .sort((a, b) => {
      const sameA = a.equipamento === row.equipamento ? 0 : 1;
      const sameB = b.equipamento === row.equipamento ? 0 : 1;
      return sameA - sameB || a.nome.localeCompare(b.nome, locale);
    })
    .slice(0, limit);

  return { known: true, options };
}

let libraryPromise = null;

// A biblioteca muda raramente: busca uma vez por sessão (e refaz se falhar).
export function fetchLibrary() {
  if (!libraryPromise) {
    libraryPromise = db.from('exercise_library')
      .select('nome, grupo_muscular, tipo, equipamento, series, reps, descanso, tecnica, is_post_workout, nivel_minimo')
      .then(({ data, error }) => {
        if (error) throw error;
        return data || [];
      })
      .catch(err => {
        libraryPromise = null;
        throw err;
      });
  }
  return libraryPromise;
}

export async function fetchSwapContext(userId) {
  const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const [library, discomfort] = await Promise.all([
    fetchLibrary(),
    db.from('exercise_discomfort').select('exercise_name')
      .eq('user_id', userId).in('severity', ['forte', 'lesao']).gte('log_date', since),
  ]);
  if (discomfort.error) throw discomfort.error;
  return { library, avoidNames: (discomfort.data || []).map(d => d.exercise_name) };
}
