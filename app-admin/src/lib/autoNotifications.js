import { db } from './supabase';

export const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Valores de exemplo só pra pré-visualizar o texto no painel.
export const SAMPLE_VALUES = {
  nome: 'Ana', foco: 'Peito / Ombro', quando: 'em 2 dias', faltam: 2, feitos: 3, meta: 5, dias: 21,
};

// Espelha renderTemplate de supabase/functions/_shared/engagement.ts — os dois
// lados não compartilham build, então a função é duplicada (mesmo critério de
// limpeza: chave sem valor some, espaços/pontuação soltos são ajustados).
export function renderTemplate(template, values = SAMPLE_VALUES) {
  return String(template || '')
    .replace(/\{(\w+)\}/g, (_, key) => (values[key] === null || values[key] === undefined ? '' : String(values[key])))
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Conta envios por tipo nos últimos 7 e 30 dias a partir das linhas do log.
export function countByKind(rows, now = new Date()) {
  const d7 = now.getTime() - 7 * 86400000;
  const d30 = now.getTime() - 30 * 86400000;
  const out = {};
  for (const r of rows) {
    const t = new Date(r.created_at).getTime();
    if (t < d30) continue;
    const entry = (out[r.kind] ||= { d7: 0, d30: 0 });
    entry.d30++;
    if (t >= d7) entry.d7++;
  }
  return out;
}

export function describeSchedule(rule) {
  const hour = `${String(rule.send_hour).padStart(2, '0')}h`;
  const days = rule.weekdays?.length
    ? [...rule.weekdays].sort((a, b) => a - b).map(d => WEEKDAY_LABELS[d]).join(', ')
    : 'todos os dias';
  return `${days} às ${hour}`;
}

export async function fetchRules() {
  const { data, error } = await db.from('engagement_rules').select('*').order('priority', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function saveRule(kind, fields) {
  const { error } = await db.from('engagement_rules')
    .update({ ...fields, updated_at: new Date().toISOString() }).eq('kind', kind);
  if (error) throw error;
}

export async function fetchLog() {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [{ data: rows, error }, { data: recent, error: recentError }] = await Promise.all([
    db.from('notification_log').select('kind, created_at').gte('created_at', since).limit(10000),
    db.from('notification_log').select('id, user_id, kind, title, created_at').order('created_at', { ascending: false }).limit(30),
  ]);
  if (error) throw error;
  if (recentError) throw recentError;
  return { rows: rows || [], recent: recent || [] };
}

// Quem receberia a regra agora (ignora horário e dia da semana; respeita regra
// ligada, opt-out, push ativo, intervalo mínimo e o limite de 1 por dia).
export async function fetchPreview(kind) {
  const { data, error } = await db.rpc('admin_engagement_preview', { rule_kind: kind });
  if (error) throw error;
  return data || [];
}

// Texto exato que essa pessoa receberia, com os dados reais dela.
export function previewMessage(rule, candidate) {
  const values = { nome: candidate.nome, ...(candidate.vars || {}) };
  return { title: renderTemplate(rule.title, values), body: renderTemplate(rule.body, values) };
}
