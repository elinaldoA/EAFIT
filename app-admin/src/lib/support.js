import { db } from './supabase';
import { KIND_LABELS as FEEDBACK_KINDS, replyToFeedback, updateFeedback } from './feedback';
import { TOPIC_LABELS, replyMailto, setContactStatus } from './contactMessages';

// Central de suporte (Acompanhamento → Central de suporte): feedback do app e
// contato do site numa fila só. SQL em
// supabase/migrations/20261128090000_support_queue.sql.

export const SOURCE_LABELS = { feedback: 'App', contato: 'Site' };
export const STATUS_LABELS = { novo: 'Novo', em_andamento: 'Em andamento', resolvido: 'Resolvido' };
export const STATUS_BADGE = { novo: 'badge badge--warning', em_andamento: 'badge badge--admin', resolvido: 'badge badge--ok' };
export const VIEWS = [
  { key: 'abertos', label: 'Abertos' },
  { key: 'meus', label: 'Comigo' },
  { key: 'sem_dono', label: 'Sem responsável' },
  { key: 'resolvido', label: 'Resolvidos' },
];
// Aberto há mais que isso fica marcado como atrasado.
export const LATE_HOURS = 48;

export function kindLabel(item) {
  return item.source === 'feedback' ? FEEDBACK_KINDS[item.kind] || item.kind : TOPIC_LABELS[item.kind] || item.kind;
}

export function mapItem(r) {
  return {
    source: r.sq_source, id: r.sq_id, createdAt: r.sq_created_at, kind: r.sq_kind, message: r.sq_message,
    status: r.sq_status, name: r.sq_name, email: r.sq_email, account: r.sq_account, assignedTo: r.sq_assigned_to,
    answeredAt: r.sq_answered_at, errors7: Number(r.sq_errors7) || 0, reply: r.sq_reply,
  };
}

export function ageHours(item, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(item.createdAt).getTime()) / 3600000));
}

export function formatAge(hours) {
  if (hours < 1) return 'agora';
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

export function filterView(items, view, adminId) {
  if (view === 'meus') return items.filter(i => i.assignedTo === adminId);
  if (view === 'sem_dono') return items.filter(i => !i.assignedTo);
  return items;
}

async function rpcRows(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data || [];
}

export async function fetchSupportQueue(view) {
  const status = view === 'resolvido' ? 'resolvido' : 'abertos';
  const [rows, stats, admins] = await Promise.all([
    rpcRows('admin_support_queue', { p_status: status, max_rows: 300 }),
    rpcRows('admin_support_stats'),
    rpcRows('admin_list_admin_accounts').catch(() => []),
  ]);
  const s = stats[0] || {};
  return {
    items: rows.map(mapItem),
    stats: {
      open: Number(s.ss_open) || 0, unassigned: Number(s.ss_unassigned) || 0, late: Number(s.ss_old) || 0,
      answered30: Number(s.ss_answered30) || 0, medianHours: s.ss_median_hours == null ? null : Number(s.ss_median_hours),
    },
    admins: admins.map(a => ({ id: a.ad_user, label: a.ad_name || a.ad_email })),
  };
}

export async function assignItem(item, adminId, byId) {
  const { error } = await db.from('support_assignments').upsert({
    source: item.source, item_id: item.id, assigned_to: adminId || null,
    updated_at: new Date().toISOString(), updated_by: byId || null,
  });
  if (error) throw error;
  // Feedback: pegar para si já tira de "novo".
  if (item.source === 'feedback' && adminId && item.status === 'novo') await updateFeedback(item.id, { status: 'em_andamento' });
}

export async function resolveItem(item) {
  if (item.source === 'feedback') await updateFeedback(item.id, { status: 'resolvido', resolved_at: new Date().toISOString() });
  else await setContactStatus(item.id, 'respondido');
}

export async function reopenItem(item) {
  if (item.source === 'feedback') await updateFeedback(item.id, { status: 'em_andamento', resolved_at: null });
  else await setContactStatus(item.id, 'novo');
}

// Feedback: resposta no app (push + e-mail), pela função que já existe.
export function replyInApp(item, text, resolve) {
  return replyToFeedback({ id: item.id, user_id: item.account, status: item.status }, text, { resolve });
}

export function contactMailto(item) {
  return replyMailto({ name: item.name, email: item.email, message: item.message, lang: 'pt' });
}
