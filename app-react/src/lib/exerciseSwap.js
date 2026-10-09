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

// O PostgREST devolve no máximo 1000 linhas por consulta e a biblioteca já tem
// isso: busca em páginas (ordenadas pelo nome, que é único) até acabar.
const LIBRARY_PAGE_SIZE = 500;

async function fetchAllLibraryRows() {
  const rows = [];
  for (let from = 0; ; from += LIBRARY_PAGE_SIZE) {
    const { data, error } = await db.from('exercise_library')
      .select('nome, grupo_muscular, tipo, equipamento, series, reps, descanso, tecnica, is_post_workout, nivel_minimo')
      .order('nome')
      .range(from, from + LIBRARY_PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < LIBRARY_PAGE_SIZE) return rows;
  }
}

// A biblioteca muda raramente: busca uma vez por sessão (e refaz se falhar).
export function fetchLibrary() {
  if (!libraryPromise) {
    libraryPromise = fetchAllLibraryRows()
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
