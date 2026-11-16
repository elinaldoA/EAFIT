import { db } from '../../lib/supabase';
import { t } from '../../lib/i18n';

// Tênis do EAFIT Run (tabela public.run_shoes).
// (reexportado por runs.js: quem importa de ./runs continua igual)

// ---- Tênis (tabela public.run_shoes) ----------------------------------------
// Os km de cada tênis saem das corridas com aquele shoe_id, mais initial_m (o
// que já tinha rodado antes do app). A lista fica guardada no aparelho para o
// fim da corrida sem internet ainda mostrar os tênis.

const SHOE_COLUMNS = 'id, name, initial_m, limit_m, retired, created_at';
const SHOES_CACHE_KEY = 'eafit_run_shoes';
const LAST_SHOE_KEY = 'eafit_run_shoe_last';
// Vida útil padrão de um tênis de corrida (km).
export const SHOE_LIMIT_KM = 700;
// A partir dessa fração da vida útil o app avisa.
export const SHOE_WARN = 0.9;

function readShoeCache(userId) {
  try {
    const all = JSON.parse(localStorage.getItem(SHOES_CACHE_KEY) || '{}');
    return Array.isArray(all?.[userId]) ? all[userId] : [];
  } catch {
    return [];
  }
}

function writeShoeCache(userId, list) {
  try {
    const all = JSON.parse(localStorage.getItem(SHOES_CACHE_KEY) || '{}') || {};
    all[userId] = list;
    localStorage.setItem(SHOES_CACHE_KEY, JSON.stringify(all));
  } catch { /* sem storage */ }
}

const normalizeShoe = s => ({
  ...s, initial_m: Number(s.initial_m) || 0, limit_m: Number(s.limit_m) || SHOE_LIMIT_KM * 1000, retired: !!s.retired,
});

// Tênis da pessoa (do mais antigo ao mais novo). Sem internet, os do aparelho.
export async function fetchShoes(userId) {
  try {
    const { data, error } = await db.from('run_shoes').select(SHOE_COLUMNS).eq('user_id', userId).order('created_at', { ascending: true });
    if (error) throw error;
    const list = (data || []).map(normalizeShoe);
    writeShoeCache(userId, list);
    return list;
  } catch (err) {
    console.error('fetchShoes:', err);
    return readShoeCache(userId);
  }
}

export const cachedShoes = userId => readShoeCache(userId);

const kmToM = v => Math.round((Number(String(v ?? '').replace(',', '.')) || 0) * 1000);

// Novo tênis: nome, km já rodados e vida útil (km). Devolve o tênis salvo.
export async function addShoe(userId, { name, initialKm = 0, limitKm = SHOE_LIMIT_KM }) {
  const row = {
    user_id: userId,
    name: String(name || '').trim().slice(0, 60),
    initial_m: Math.min(5000000, Math.max(0, kmToM(initialKm))),
    limit_m: Math.min(5000000, Math.max(50000, kmToM(limitKm) || SHOE_LIMIT_KM * 1000)),
  };
  const { data, error } = await db.from('run_shoes').insert(row).select(SHOE_COLUMNS).single();
  if (error) throw error;
  const shoe = normalizeShoe(data);
  writeShoeCache(userId, [...readShoeCache(userId).filter(s => s.id !== shoe.id), shoe]);
  return shoe;
}

export async function updateShoe(userId, id, patch) {
  const { data, error } = await db.from('run_shoes').update(patch).eq('id', id).eq('user_id', userId).select(SHOE_COLUMNS).single();
  if (error) throw error;
  const shoe = normalizeShoe(data);
  writeShoeCache(userId, readShoeCache(userId).map(s => (s.id === id ? shoe : s)));
  return shoe;
}

export async function deleteShoe(userId, id) {
  const { error } = await db.from('run_shoes').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
  writeShoeCache(userId, readShoeCache(userId).filter(s => s.id !== id));
}

// Metros rodados por tênis: { [id]: metros } (initial_m + corridas).
export function shoeUsage(shoes, runs) {
  const out = Object.fromEntries(shoes.map(s => [s.id, s.initial_m || 0]));
  for (const r of runs) if (r.shoe_id && r.shoe_id in out) out[r.shoe_id] += r.distance_m || 0;
  return out;
}

// 'ok' | 'warn' (perto da vida útil) | 'over' (passou).
export function shoeWear(shoe, meters) {
  if (meters >= shoe.limit_m) return 'over';
  return meters >= shoe.limit_m * SHOE_WARN ? 'warn' : 'ok';
}

// Tênis sugerido para a próxima corrida: o último usado, se ainda está ativo;
// senão o único ativo; senão nenhum.
export function defaultShoeId(shoes) {
  const active = shoes.filter(s => !s.retired);
  let last = null;
  try { last = localStorage.getItem(LAST_SHOE_KEY); } catch { /* sem storage */ }
  if (last && active.some(s => s.id === last)) return last;
  return active.length === 1 ? active[0].id : null;
}

export function rememberShoe(id) {
  try {
    if (id) localStorage.setItem(LAST_SHOE_KEY, id);
    else localStorage.removeItem(LAST_SHOE_KEY);
  } catch { /* sem storage */ }
}

// Aviso depois de salvar a corrida: o tênis acabou de entrar na faixa de troca.
export function shoeWearNotice(shoe, beforeM, addedM) {
  if (!shoe) return null;
  const before = shoeWear(shoe, beforeM);
  const after = shoeWear(shoe, beforeM + addedM);
  if (after === before || after === 'ok') return null;
  return after === 'over'
    ? t('👟 {v1} passou de {v2} km: hora de trocar de tênis', { v1: shoe.name, v2: Math.round(shoe.limit_m / 1000) })
    : t('👟 {v1} está perto do fim da vida útil ({v2} de {v3} km)', { v1: shoe.name, v2: Math.round((beforeM + addedM) / 1000), v3: Math.round(shoe.limit_m / 1000) });
}
