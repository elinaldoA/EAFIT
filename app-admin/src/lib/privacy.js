import { db } from './supabase';

// Pedidos de titulares (LGPD) — Sistema → Pedidos LGPD. SQL em
// supabase/migrations/20261128110000_privacy_requests.sql.

export const KIND_LABELS = {
  acesso: 'Acesso aos dados',
  portabilidade: 'Portabilidade',
  correcao: 'Correção',
  exclusao: 'Exclusão da conta',
  revogacao: 'Revogar consentimento',
  outro: 'Outro',
};
export const STATUS_LABELS = { aberto: 'Aberto', em_andamento: 'Em andamento', concluido: 'Concluído', recusado: 'Recusado' };
export const STATUS_BADGE = { aberto: 'badge badge--warning', em_andamento: 'badge badge--admin', concluido: 'badge badge--ok', recusado: 'badge' };
export const CHANNEL_LABELS = { email: 'E-mail', app: 'App', site: 'Site', outro: 'Outro' };
export const DUE_DAYS = 15;

const DAY = 86400000;

// Dias até o prazo (negativo = vencido); null para pedidos encerrados.
export function daysLeft(req, now = Date.now()) {
  if (req.status === 'concluido' || req.status === 'recusado') return null;
  return Math.ceil((new Date(req.due_at).getTime() - now) / DAY);
}

export function dueFrom(receivedOn) {
  const d = new Date(`${receivedOn}T12:00:00-03:00`);
  return new Date(d.getTime() + DUE_DAYS * DAY).toISOString();
}

export async function fetchRequests() {
  const { data, error } = await db.from('privacy_requests')
    .select('id, user_id, email, kind, status, channel, received_at, due_at, notes, resolved_at')
    .order('status', { ascending: true }).order('due_at', { ascending: true }).limit(300);
  if (error) throw error;
  return data || [];
}

export async function findUserByEmail(email) {
  const { data, error } = await db.rpc('admin_find_user_by_email', { p_email: email });
  if (error) throw error;
  return data?.[0] || null;
}

export async function createRequest({ email, kind, channel, receivedOn, notes }, adminId) {
  const clean = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw new Error('E-mail inválido.');
  const user = await findUserByEmail(clean);
  const received = receivedOn ? new Date(`${receivedOn}T12:00:00-03:00`).toISOString() : new Date().toISOString();
  const { error } = await db.from('privacy_requests').insert({
    email: clean, user_id: user?.fu_user || null, kind, channel, notes: String(notes || '').trim(),
    received_at: received, due_at: receivedOn ? dueFrom(receivedOn) : new Date(Date.now() + DUE_DAYS * DAY).toISOString(),
    created_by: adminId,
  });
  if (error) throw error;
  return user;
}

export async function updateRequest(id, patch) {
  const { error } = await db.from('privacy_requests').update(patch).eq('id', id);
  if (error) throw error;
}
