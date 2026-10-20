import { db } from './supabase';
import { todayStr } from './community';

// Meu relatório: cartões escolhidos por admin, cada um comparando o período
// com o anterior ou com o do ano passado. SQL em
// supabase/migrations/20261128230000_report_builder.sql (admin_metric_values).

// Métricas base vêm do banco; as derivadas (taxas e médias) são calculadas aqui.
export const CATALOG = {
  signups: { label: 'Cadastros', group: 'Crescimento' },
  activated: { label: 'Ativados (treinaram na 1ª semana)', group: 'Crescimento' },
  activation_pct: { label: 'Taxa de ativação', group: 'Crescimento', format: 'pct', from: ['activated', 'signups'] },
  referrals: { label: 'Cadastros por parceiros', group: 'Crescimento' },
  app_openers: { label: 'Pessoas que abriram o app', group: 'Engajamento' },
  active_trainers: { label: 'Pessoas que treinaram', group: 'Engajamento' },
  training_days: { label: 'Dias de treino', group: 'Engajamento' },
  days_per_active: { label: 'Dias de treino por pessoa ativa', group: 'Engajamento', format: 'dec', from: ['training_days', 'active_trainers'] },
  challenge_joins: { label: 'Entradas em desafios', group: 'Comunidade' },
  trainer_links: { label: 'Alunos vinculados a personais', group: 'Comunidade' },
  notifications_sent: { label: 'Avisos enviados', group: 'Comunicação' },
  notifications_read_pct: { label: 'Avisos lidos', group: 'Comunicação', format: 'pct', from: ['notifications_read', 'notifications_sent'] },
  survey_answers: { label: 'Respostas de pesquisa', group: 'Comunicação' },
  feedback: { label: 'Feedbacks recebidos', group: 'Suporte' },
  contact_messages: { label: 'Mensagens de contato', group: 'Suporte' },
  deletions: { label: 'Contas excluídas', group: 'Suporte', lowerIsBetter: true },
};

export const DEFAULT_CARDS = ['signups', 'activation_pct', 'active_trainers', 'days_per_active', 'notifications_read_pct', 'deletions'];

export const PERIODS = [
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
  { key: 'mes', label: 'Este mês' },
  { key: 'mes_passado', label: 'Mês passado' },
  { key: 'custom', label: 'Personalizado' },
];

export const COMPARE = { anterior: 'Período anterior', ano: 'Mesmo período do ano passado' };

function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
const shiftYear = (day, n) => {
  const [y, m, d] = day.split('-').map(Number);
  const last = new Date(Date.UTC(y + n, m, 0)).getUTCDate();
  return `${y + n}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
};

export function periodRange(kind, today = todayStr(), custom = {}) {
  if (kind === '7d') return { from: addDays(today, -6), to: today };
  if (kind === '90d') return { from: addDays(today, -89), to: today };
  if (kind === 'mes') return { from: `${today.slice(0, 7)}-01`, to: today };
  if (kind === 'mes_passado') {
    const first = `${today.slice(0, 7)}-01`;
    const to = addDays(first, -1);
    return { from: `${to.slice(0, 7)}-01`, to };
  }
  if (kind === 'custom' && custom.from && custom.to && custom.from <= custom.to) return { from: custom.from, to: custom.to };
  return { from: addDays(today, -29), to: today };
}

// Período de comparação: o imediatamente anterior, do mesmo tamanho, ou as
// mesmas datas um ano antes.
export function compareRange(range, mode) {
  if (mode === 'ano') return { from: shiftYear(range.from, -1), to: shiftYear(range.to, -1) };
  const len = daysBetween(range.from, range.to);
  const to = addDays(range.from, -1);
  return { from: addDays(to, -len), to };
}

export function baseKeys(cards) {
  return [...new Set(cards.flatMap(k => CATALOG[k]?.from || (CATALOG[k] ? [k] : [])))];
}

function valueOf(key, values) {
  const def = CATALOG[key];
  if (!def?.from) return values[key] ?? null;
  const [a, b] = def.from.map(k => values[k]);
  if (!b) return null;
  return def.format === 'pct' ? Math.round((a / b) * 1000) / 10 : Math.round((a / b) * 10) / 10;
}

export function computeCards(cards, current, previous) {
  return cards.filter(k => CATALOG[k]).map(k => {
    const value = valueOf(k, current);
    const prev = previous ? valueOf(k, previous) : null;
    const delta = value != null && prev != null ? Math.round((value - prev) * 10) / 10 : null;
    const deltaPct = delta != null && prev ? Math.round((delta / prev) * 100) : null;
    const better = delta == null || delta === 0 ? null : (delta > 0) !== !!CATALOG[k].lowerIsBetter;
    return { key: k, ...CATALOG[k], value, prev, delta, deltaPct, better };
  });
}

export function formatMetric(card, v) {
  if (v == null) return '—';
  if (card.format === 'pct') return `${v.toLocaleString('pt-BR')}%`;
  return v.toLocaleString('pt-BR');
}

async function metricValues(keys, range) {
  const { data, error } = await db.rpc('admin_metric_values', { p_keys: keys, p_from: range.from, p_to: range.to });
  if (error) throw error;
  return Object.fromEntries((data || []).map(r => [r.mv_key, Number(r.mv_value) || 0]));
}

export async function fetchReport(cards, range, cmp) {
  const keys = baseKeys(cards);
  const [current, previous] = await Promise.all([metricValues(keys, range), cmp ? metricValues(keys, cmp) : null]);
  return computeCards(cards, current, previous);
}

export async function fetchMyCards(adminId) {
  const { data, error } = await db.from('admin_report_cards').select('cards').eq('admin_id', adminId).maybeSingle();
  if (error) throw error;
  const list = (data?.cards || []).filter(k => CATALOG[k]);
  return data ? list : DEFAULT_CARDS;
}

export async function saveMyCards(adminId, cards) {
  const { error } = await db.from('admin_report_cards').upsert({ admin_id: adminId, cards, updated_at: new Date().toISOString() });
  if (error) throw error;
}
