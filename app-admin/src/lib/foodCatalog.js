import { db } from './supabase';

// Catálogo de alimentos (tabela food_catalog): o que a busca da aba Nutrição
// oferece além da lista do app e da TACO. Valores por 100 g.
export const EMPTY_FOOD = {
  name: '', icon: '🍽️', category: '', portion_g: '100', kcal: '', protein_g: '0', carbs_g: '0', fat_g: '0',
  fiber_g: '0', sodium_mg: '0', estimated: false, active: true, measures: '',
};

const FIELDS = Object.keys(EMPTY_FOOD);

// "fatia=30; copo=200" <-> [{ label, grams }]
export function parseMeasures(text) {
  return String(text || '').split(/[;\n]/).map(p => p.trim()).filter(Boolean).map(p => {
    const [label, grams] = p.split('=').map(x => x.trim());
    return { label, grams: Number(String(grams).replace(',', '.')) };
  });
}

export function measuresToText(measures) {
  return (Array.isArray(measures) ? measures : []).map(m => `${m.label}=${m.grams}`).join('; ');
}

export function toDraft(row) {
  const draft = { ...EMPTY_FOOD };
  for (const k of FIELDS) {
    if (row?.[k] == null) continue;
    draft[k] = k === 'measures' ? measuresToText(row[k]) : typeof row[k] === 'boolean' ? row[k] : String(row[k]);
  }
  return draft;
}

const num = v => Number(String(v ?? '').replace(',', '.'));

// { ok, errors, value } com os campos no formato da tabela.
export function validateFood(draft) {
  const errors = {};
  const name = String(draft.name || '').trim();
  if (!name) errors.name = 'Informe o nome.';
  else if (name.length > 60) errors.name = 'Até 60 caracteres.';
  const limits = [
    ['portion_g', 1, 2000, 'Porção de 1 a 2000 g.'], ['kcal', 0, 900, 'Calorias de 0 a 900 por 100 g.'],
    ['protein_g', 0, 100, 'De 0 a 100 g.'], ['carbs_g', 0, 100, 'De 0 a 100 g.'], ['fat_g', 0, 100, 'De 0 a 100 g.'],
    ['fiber_g', 0, 100, 'De 0 a 100 g.'], ['sodium_mg', 0, 40000, 'De 0 a 40000 mg.'],
  ];
  const value = {
    name, icon: String(draft.icon || '').trim() || '🍽️', category: String(draft.category || '').trim() || null,
    estimated: !!draft.estimated, active: draft.active !== false,
  };
  for (const [k, min, max, msg] of limits) {
    const n = String(draft[k] ?? '').trim() === '' ? NaN : num(draft[k]);
    if (!Number.isFinite(n) || n < min || n > max) errors[k] = msg;
    value[k] = n;
  }
  if (value.icon.length > 8) errors.icon = 'Use só um emoji.';
  if (value.category && value.category.length > 40) errors.category = 'Até 40 caracteres.';
  const measures = parseMeasures(draft.measures);
  if (measures.length > 6) errors.measures = 'No máximo 6 medidas.';
  else if (measures.some(m => !m.label || !(m.grams > 0))) errors.measures = 'Use o formato "fatia=30; copo=200".';
  value.measures = measures;
  // Calorias que não batem com os macros (4/4/9) quase sempre são erro de digitação.
  if (!errors.kcal && !errors.protein_g && !errors.carbs_g && !errors.fat_g) {
    const est = value.protein_g * 4 + value.carbs_g * 4 + value.fat_g * 9;
    if (Math.abs(est - value.kcal) > Math.max(40, value.kcal * 0.35)) errors.kcal = `Não bate com os macros (≈ ${Math.round(est)} kcal).`;
  }
  value.updated_at = new Date().toISOString();
  return { ok: Object.keys(errors).length === 0, errors, value };
}

export function filterFoods(rows, { search = '', status = '' } = {}) {
  const q = search.trim().toLowerCase();
  return rows.filter(r => {
    if (q && !`${r.name} ${r.category || ''}`.toLowerCase().includes(q)) return false;
    if (status === 'ativos' && !r.active) return false;
    if (status === 'inativos' && r.active) return false;
    if (status === 'estimados' && !r.estimated) return false;
    return true;
  });
}

export function friendlyFoodError(err) {
  if (err?.code === '23505') return 'Já existe um alimento com esse nome.';
  if (err?.code === '42P01') return 'A tabela food_catalog ainda não existe no banco (aplique a migration).';
  if (String(err?.message || '').includes('row-level security')) return 'Seu papel não permite alterar o catálogo.';
  return err?.message || 'Erro desconhecido.';
}

export async function fetchFoodCatalogAdmin() {
  const { data, error } = await db.from('food_catalog').select('*').order('name').limit(2000);
  if (error) throw error;
  return data || [];
}

export async function saveFood(id, value) {
  const query = id ? db.from('food_catalog').update(value).eq('id', id) : db.from('food_catalog').insert(value);
  const { error } = await query;
  if (error) throw error;
}

export async function deleteFood(id) {
  const { error } = await db.from('food_catalog').delete().eq('id', id);
  if (error) throw error;
}
