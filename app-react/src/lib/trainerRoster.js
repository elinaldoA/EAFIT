import { db } from './supabase';
import { addDays } from './pause';
import { clientAttention, sortClients, fetchClients } from './trainer';

import { t, locale } from './i18n';
// Carteira do personal: a lista de alunos com plano, meta, etiquetas e os
// últimos 14 dias, e as regras que o Painel e a lista usam para decidir quem
// precisa de quê (plano vencendo, aderência, dor relatada...).

export const MAX_TAGS = 6;
export const TAG_MAX_LEN = 20;
export const PLAN_ENDING_DAYS = 7;
export const STRIP_DAYS = 14;

const ERRORS = {
  not_authorized: t('Você não tem vínculo ativo com este aluno.'),
  invalid_tags: t('Até {MAX_TAGS} etiquetas, com até {TAG_MAX_LEN} letras cada.', { MAX_TAGS, TAG_MAX_LEN }),
};

export function friendlyRosterError(err) {
  const msg = String(err?.message || '');
  const key = Object.keys(ERRORS).find(k => msg.includes(k));
  return key ? ERRORS[key] : t('Não foi possível concluir. Tente de novo.');
}

function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

// "Ana Paula Souza" -> "AS"
export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function normalizeTags(tags) {
  const seen = new Set();
  const out = [];
  for (const raw of tags || []) {
    const tag = String(raw || '').trim().slice(0, TAG_MAX_LEN);
    const key = tag.toLocaleLowerCase(locale);
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out.slice(0, MAX_TAGS);
}

// Situação do plano ativo.
//  none: sem plano · expired: prazo passou · ending: vence em até 7 dias ·
//  ok: em dia (ou sem prazo).
export function planStatus(client, today) {
  if (!client.planName) return { level: 'none', label: t('Sem plano'), daysLeft: null };
  if (!client.planEnd) return { level: 'ok', label: t('Sem prazo'), daysLeft: null };
  const left = daysBetween(today, client.planEnd);
  if (left < 0) return { level: 'expired', label: t('Venceu há {n} dia(s)', { n: -left }), daysLeft: left };
  if (left <= PLAN_ENDING_DAYS) {
    return { level: 'ending', label: left === 0 ? t('Vence hoje') : t('Vence em {n} dia(s)', { n: left }), daysLeft: left };
  }
  return { level: 'ok', label: t('Vence em {n} dias', { n: left }), daysLeft: left };
}

// Alvo semanal: a meta do aluno ou, sem ela, os dias do plano ativo.
export function weeklyTarget(client) {
  return client.weeklyGoal || client.planDays || null;
}

// Treinos dos últimos 7 dias contra o alvo semanal, em % (até 100).
export function adherence(client) {
  const target = weeklyTarget(client);
  if (!target) return null;
  return Math.min(100, Math.round(((client.days7 || 0) / target) * 100));
}

// Últimos `n` dias, do mais antigo a hoje, marcando os treinados.
export function recentStrip(client, today, n = STRIP_DAYS) {
  const trained = new Set(client.recent || []);
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(today, i - (n - 1));
    return { date, trained: trained.has(date) };
  });
}

// O que o personal precisa fazer por cada aluno, do mais urgente ao menos.
// Cada aluno aparece uma vez, com todos os motivos; `priority` é a do motivo
// mais urgente (0 = mais urgente).
export function buildActionQueue(roster, { replies = {}, today }) {
  const out = [];
  for (const c of roster) {
    const reasons = [];
    const att = clientAttention(c, today);
    const plan = planStatus(c, today);
    if (c.pain7 > 0) reasons.push({ kind: 'dor', priority: 0, icon: '🩹', label: t('Relatou dor forte ou lesão') });
    if (replies[c.id] > 0) reasons.push({ kind: 'resposta', priority: 1, icon: '💬', label: t('{n} resposta(s) sem ler', { n: replies[c.id] }) });
    if (att.level === 'risco') reasons.push({ kind: 'sumido', priority: 1, icon: '🚨', label: att.label });
    if (!c.paused && plan.level === 'expired') reasons.push({ kind: 'plano', priority: 2, icon: '📋', label: t('Plano vencido') });
    if (att.level === 'atencao') reasons.push({ kind: 'parado', priority: 3, icon: '⏳', label: att.label });
    if (!c.paused && plan.level === 'ending') reasons.push({ kind: 'plano', priority: 4, icon: '📋', label: t('Plano: {v}', { v: plan.label.toLowerCase() }) });
    if (!c.paused && plan.level === 'none') reasons.push({ kind: 'plano', priority: 4, icon: '📋', label: t('Ainda sem plano') });
    if (att.level === 'novo' && c.since && daysBetween(String(c.since).slice(0, 10), today) >= 3) {
      reasons.push({ kind: 'novo', priority: 5, icon: '👋', label: t('Ainda não treinou') });
    }
    if (reasons.length) out.push({ client: c, reasons, priority: Math.min(...reasons.map(r => r.priority)) });
  }
  return out.sort((a, b) => a.priority - b.priority || b.reasons.length - a.reasons.length
    || String(a.client.name).localeCompare(String(b.client.name), locale));
}

// Números do topo do Painel.
export function rosterKpis(roster, today) {
  const total = roster.length;
  const active7 = roster.filter(c => c.days7 > 0).length;
  const sessions7 = roster.reduce((n, c) => n + (c.days7 || 0), 0);
  const withTarget = roster.filter(c => !c.paused).map(adherence).filter(v => v !== null);
  const adherenceAvg = withTarget.length ? Math.round(withTarget.reduce((a, b) => a + b, 0) / withTarget.length) : null;
  const plansDue = roster.filter(c => !c.paused && ['expired', 'ending'].includes(planStatus(c, today).level)).length;
  return { total, active7, sessions7, adherenceAvg, plansDue };
}

export function allTags(roster) {
  const map = new Map();
  for (const c of roster) for (const tag of c.tags || []) {
    const key = tag.toLocaleLowerCase(locale);
    if (!map.has(key)) map.set(key, tag);
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, locale));
}

export const SORTS = [
  { key: 'prioridade', label: t('Prioridade') },
  { key: 'nome', label: t('Nome') },
  { key: 'recente', label: t('Treinou por último') },
  { key: 'aderencia', label: t('Menor aderência') },
];

export function sortRoster(roster, by, today) {
  if (by === 'nome') return [...roster].sort((a, b) => String(a.name).localeCompare(String(b.name), locale));
  if (by === 'recente') return [...roster].sort((a, b) => String(b.last_day || '').localeCompare(String(a.last_day || '')));
  if (by === 'aderencia') {
    const score = c => adherence(c) ?? 101; // sem alvo vai para o fim
    return [...roster].sort((a, b) => score(a) - score(b) || String(a.name).localeCompare(String(b.name), locale));
  }
  return sortClients(roster, today);
}

export const FILTERS = [
  { key: 'todos', label: t('Todos') },
  { key: 'atencao', label: t('Precisam de atenção') },
  { key: 'ok', label: t('Em dia') },
  { key: 'plano', label: t('Plano vencendo') },
  { key: 'semplano', label: t('Sem plano') },
];

const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase(locale);

export function matchesFilter(client, filter, today) {
  const level = clientAttention(client, today).level;
  const plan = planStatus(client, today).level;
  if (filter === 'atencao') return ['risco', 'atencao', 'novo'].includes(level) || client.pain7 > 0;
  if (filter === 'ok') return level === 'ok';
  if (filter === 'plano') return plan === 'expired' || plan === 'ending';
  if (filter === 'semplano') return plan === 'none';
  return true;
}

export function filterRoster(roster, { filter = 'todos', query = '', tag = '' }, today) {
  const q = fold(query.trim());
  const tagKey = tag.toLocaleLowerCase(locale);
  return roster.filter(c => matchesFilter(c, filter, today)
    && (!q || fold(c.name).includes(q) || fold(c.email).includes(q) || (c.tags || []).some(x => fold(x).includes(q)))
    && (!tagKey || (c.tags || []).some(x => x.toLocaleLowerCase(locale) === tagKey)));
}

// ---- RPCs ------------------------------------------------------------------
const mapRoster = r => ({
  id: r.rs_id, name: r.rs_name, email: r.rs_email, since: r.rs_since, last_day: r.rs_last_day,
  days7: r.rs_days_7, days30: r.rs_days_30, paused: !!r.rs_paused, goal: r.rs_goal, level: r.rs_level,
  weeklyGoal: r.rs_weekly_goal, planName: r.rs_plan_name, planDays: r.rs_plan_days, planEnd: r.rs_plan_end,
  planByMe: !!r.rs_plan_by_me, pain7: r.rs_pain_7 || 0, tags: r.rs_tags || [], recent: r.rs_recent || [],
});

const isMissingRpc = error => error?.code === 'PGRST202' || error?.code === '42883';

// Banco sem a migration 20261129010000_trainer_pro.sql: cai na lista antiga,
// sem plano, etiquetas e últimos dias (o resto da tela funciona igual).
export async function fetchRoster() {
  const { data, error } = await db.rpc('trainer_roster');
  if (error) {
    if (!isMissingRpc(error)) throw error;
    const list = await fetchClients();
    return list.map(c => ({ ...c, weeklyGoal: null, planName: null, planDays: null, planEnd: null, planByMe: false, pain7: 0, tags: [], recent: [], legacy: true }));
  }
  return (data || []).map(mapRoster);
}

export async function setClientTags(clientId, tags) {
  const { data, error } = await db.rpc('trainer_set_client_tags', { p_client: clientId, p_tags: normalizeTags(tags) });
  if (error) throw error;
  return data || [];
}

export async function fetchClientPlans(clientId) {
  const { data, error } = await db.rpc('trainer_client_plans', { p_client: clientId });
  if (error) throw error;
  return (data || []).map(r => ({
    id: r.pl_id, name: r.pl_name, at: r.pl_at, start: r.pl_start, end: r.pl_end,
    weeks: r.pl_weeks, active: !!r.pl_active, byMe: !!r.pl_by_me, days: r.pl_days,
  }));
}

// Treinos por semana nas últimas `weeks` semanas (a última termina hoje), do
// mais antigo ao mais recente, a partir dos dias treinados da ficha.
export function weeklyCounts(days, today, weeks = 8) {
  const set = new Set(days || []);
  return Array.from({ length: weeks }, (_, w) => {
    const end = addDays(today, -7 * (weeks - 1 - w));
    let count = 0;
    for (let i = 0; i < 7; i++) if (set.has(addDays(end, -i))) count += 1;
    return { end, count };
  });
}
