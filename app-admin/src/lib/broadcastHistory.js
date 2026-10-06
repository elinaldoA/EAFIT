import { db } from './supabase';

export const HISTORY_FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'manual', label: 'Manuais' },
  { key: 'scheduled', label: 'Agendados' },
  { key: 'auto', label: 'Automáticos' },
];

// Junta os envios manuais/agendados (admin_audit_log, 1 linha por envio em
// massa) e os automáticos (notification_log, 1 linha por usuário) numa lista
// única, do mais recente para o mais antigo. `emailById` traduz user_id em e-mail.
export function mergeHistory(audit, auto, emailById = {}) {
  const manual = (audit || []).map(r => ({
    id: `a-${r.id}`,
    at: r.created_at,
    origin: r.details?.scheduled ? 'scheduled' : 'manual',
    title: r.details?.title || '—',
    body: r.details?.body || '—',
    recipients: r.details?.targetCount ?? null,
    delivered: r.details?.sent ?? null,
    kind: null,
  }));
  const automatic = (auto || []).map(r => ({
    id: `n-${r.id}`,
    at: r.created_at,
    origin: 'auto',
    title: r.title,
    body: r.body,
    recipients: 1,
    delivered: 1,
    kind: r.kind,
    to: emailById[r.user_id] || null,
  }));
  return [...manual, ...automatic].sort((x, y) => new Date(y.at) - new Date(x.at));
}

export function filterHistory(items, filter) {
  return filter === 'all' ? items : items.filter(i => i.origin === filter);
}

export async function fetchBroadcastHistory(limit = 100) {
  const [audit, auto] = await Promise.all([
    db.from('admin_audit_log').select('id, created_at, details')
      .eq('action', 'broadcastPush').order('created_at', { ascending: false }).limit(limit),
    db.from('notification_log').select('id, user_id, kind, title, body, created_at')
      .order('created_at', { ascending: false }).limit(limit),
  ]);
  if (audit.error) throw audit.error;
  if (auto.error) throw auto.error;
  return { audit: audit.data, auto: auto.data };
}
