import { db } from './supabase';

export const TIPOS = [
  { value: 'composto', label: 'Composto' },
  { value: 'isolado', label: 'Isolado' },
  { value: 'cardio', label: 'Cardio' },
];

export const NIVEIS_MINIMOS = [
  { value: 'iniciante', label: 'Iniciante' },
  { value: 'intermediario', label: 'Intermediário' },
  { value: 'avancado', label: 'Avançado' },
];

export const EMPTY_EXERCISE = {
  nome: '', grupo_muscular: '', tipo: 'composto', equipamento: '', series: '3', reps: '12-15',
  descanso: '45s', tecnica: '', is_post_workout: false, nivel_minimo: 'iniciante',
};

// Campos que o formulário envia (ids/datas ficam de fora).
const FIELDS = Object.keys(EMPTY_EXERCISE);

export function toDraft(row) {
  const draft = { ...EMPTY_EXERCISE };
  for (const k of FIELDS) draft[k] = row?.[k] ?? EMPTY_EXERCISE[k];
  return draft;
}

// Devolve { ok, errors: { campo: mensagem }, value } com os textos aparados.
export function validateExercise(draft) {
  const value = { ...draft };
  for (const k of ['nome', 'grupo_muscular', 'equipamento', 'series', 'reps', 'descanso', 'tecnica']) {
    value[k] = String(draft[k] ?? '').trim();
  }
  value.grupo_muscular = value.grupo_muscular.toLowerCase();
  value.equipamento = value.equipamento.toLowerCase();
  const errors = {};
  if (!value.nome) errors.nome = 'Informe o nome.';
  if (!value.grupo_muscular) errors.grupo_muscular = 'Informe o grupo muscular.';
  if (!TIPOS.some(t => t.value === value.tipo)) errors.tipo = 'Tipo inválido.';
  if (!NIVEIS_MINIMOS.some(n => n.value === value.nivel_minimo)) errors.nivel_minimo = 'Nível inválido.';
  if (!value.series) errors.series = 'Informe as séries.';
  if (!value.reps) errors.reps = 'Informe as repetições.';
  if (!value.descanso) errors.descanso = 'Informe o descanso.';
  return { ok: Object.keys(errors).length === 0, errors, value };
}

export function filterExercises(rows, { search = '', grupo = '', tipo = '', nivel = '', problema = '' } = {}) {
  const q = search.trim().toLowerCase();
  return rows.filter(r => {
    if (q && !r.nome.toLowerCase().includes(q)) return false;
    if (grupo && r.grupo_muscular !== grupo) return false;
    if (tipo && r.tipo !== tipo) return false;
    if (nivel && r.nivel_minimo !== nivel) return false;
    if (problema === 'dor' && !(r.discomfort_count > 0)) return false;
    if (problema === 'sem-uso' && r.plans_count > 0) return false;
    if (problema === 'sem-midia' && r.has_media) return false;
    return true;
  });
}

export function friendlyLibraryError(err) {
  if (err?.code === '23505') return 'Já existe um exercício com esse nome.';
  if (String(err?.message || '').includes('row-level security')) return 'Seu papel não permite alterar a biblioteca.';
  return err?.message || 'Erro desconhecido.';
}

// O PostgREST devolve no máximo 1000 linhas por consulta e a biblioteca já tem
// isso: busca em páginas até acabar. `columns` e `order` (colunas de ordenação,
// terminando numa única — o nome — pra página não repetir nem pular linha).
const LIBRARY_PAGE_SIZE = 500;

export async function fetchAllLibraryRows(columns, order = ['nome']) {
  const rows = [];
  for (let from = 0; ; from += LIBRARY_PAGE_SIZE) {
    let query = db.from('exercise_library').select(columns);
    for (const col of order) query = query.order(col);
    const { data, error } = await query.range(from, from + LIBRARY_PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < LIBRARY_PAGE_SIZE) return rows;
  }
}

// Junta a biblioteca com mídia própria e uso (planos e relatos de dor).
export async function fetchLibrary() {
  const [lib, media, usage] = await Promise.all([
    fetchAllLibraryRows('*', ['grupo_muscular', 'nome']),
    db.from('exercise_media').select('nome'),
    db.rpc('admin_exercise_usage'),
  ]);
  // Mídia e uso são complementares: se falharem, a lista ainda abre.
  const withMedia = new Set((media.data || []).map(m => m.nome));
  const usageByName = new Map((usage.data || []).map(u => [u.nome, u]));
  return lib.map(r => ({
    ...r,
    has_media: withMedia.has(r.nome),
    plans_count: Number(usageByName.get(r.nome)?.plans_count || 0),
    discomfort_count: Number(usageByName.get(r.nome)?.discomfort_count || 0),
  }));
}

export async function saveExercise(id, value) {
  const query = id
    ? db.from('exercise_library').update(value).eq('id', id)
    : db.from('exercise_library').insert(value);
  const { error } = await query;
  if (error) throw error;
}

export async function deleteExercise(id) {
  const { error } = await db.from('exercise_library').delete().eq('id', id);
  if (error) throw error;
}
