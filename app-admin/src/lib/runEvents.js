import { db } from './supabase';

// Provas de corrida (tabela run_events): o calendário "Próximas corridas perto
// de você" da aba Gravar do EAFIT Run. As provas entram como rascunho (script
// de importação ou cadastro manual) e só aparecem no app depois de aprovadas.
export const EVENT_STATUS = { draft: 'Rascunho', approved: 'Aprovada', rejected: 'Descartada' };

export const EMPTY_EVENT = {
  name: '', event_date: '', city: '', state: '', venue: '', distances: '', lat: '', lng: '', url: '',
};

const num = v => Number(String(v ?? '').trim().replace(',', '.'));

// "5, 10; 21,1" -> [5, 10, 21.1]. Separa por ponto e vírgula, barra ou espaço; a vírgula é decimal.
export function parseDistances(text) {
  return String(text || '').split(/[;/\s]+/).map(p => num(p.replace(/km$/i, ''))).filter(n => Number.isFinite(n) && n > 0);
}

export const distancesToText = list => (Array.isArray(list) ? list : []).map(n => String(Number(n)).replace('.', ',')).join('; ');

export function toDraft(row) {
  const draft = { ...EMPTY_EVENT };
  for (const k of Object.keys(EMPTY_EVENT)) {
    if (row?.[k] == null) continue;
    draft[k] = k === 'distances' ? distancesToText(row[k]) : String(row[k]);
  }
  return draft;
}

const isUrl = v => /^https?:\/\/\S+$/i.test(v);

// { ok, errors, value } com os campos no formato da tabela.
export function validateEvent(draft) {
  const errors = {};
  const name = String(draft.name || '').trim();
  if (name.length < 3 || name.length > 120) errors.name = 'Nome de 3 a 120 caracteres.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.event_date || '')) errors.event_date = 'Informe a data.';
  const state = String(draft.state || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) errors.state = 'UF com 2 letras.';
  const distances = parseDistances(draft.distances);
  if (distances.length > 8 || distances.some(d => d > 250)) errors.distances = 'Até 8 distâncias, de até 250 km.';
  const url = String(draft.url || '').trim();
  if (url && !isUrl(url)) errors.url = 'Use um link que comece com http:// ou https://.';
  const coord = (k, max) => {
    if (String(draft[k] ?? '').trim() === '') return null;
    const n = num(draft[k]);
    if (!Number.isFinite(n) || Math.abs(n) > max) { errors[k] = `Valor entre -${max} e ${max}.`; return null; }
    return Math.round(n * 1e5) / 1e5;
  };
  const lat = coord('lat', 90);
  const lng = coord('lng', 180);
  if ((lat == null) !== (lng == null) && !errors.lat && !errors.lng) errors.lat = 'Informe latitude e longitude juntas.';
  const value = {
    name, event_date: draft.event_date, city: String(draft.city || '').trim() || null, state,
    venue: String(draft.venue || '').trim() || null, distances, lat, lng, url: url || null,
  };
  return { ok: !Object.keys(errors).length, errors, value };
}

export function filterEvents(rows, { status = '', search = '' } = {}) {
  const q = String(search).trim().toLowerCase();
  return rows.filter(r => (!status || r.status === status)
    && (!q || `${r.name} ${r.city || ''} ${r.state}`.toLowerCase().includes(q)));
}

export function friendlyEventError(err) {
  if (err?.code === '23505') return 'Essa prova já está cadastrada.';
  if (err?.code === '42P01') return 'A tabela run_events ainda não existe no banco (aplique a migration).';
  if (String(err?.message || '').includes('row-level security')) return 'Seu papel não permite alterar as provas.';
  return err?.message || 'Erro desconhecido.';
}

export async function fetchRunEventsAdmin() {
  const { data, error } = await db.from('run_events').select('*').order('event_date').limit(3000);
  if (error) throw error;
  return data || [];
}

export async function saveRunEvent(id, value) {
  const query = id ? db.from('run_events').update(value).eq('id', id) : db.from('run_events').insert({ ...value, source: 'manual', status: 'approved' });
  const { error } = await query;
  if (error) throw error;
}

export async function setEventsStatus(ids, status) {
  if (!ids.length) return;
  const { error } = await db.from('run_events').update({ status }).in('id', ids);
  if (error) throw error;
}

export async function deleteRunEvent(id) {
  const { error } = await db.from('run_events').delete().eq('id', id);
  if (error) throw error;
}
