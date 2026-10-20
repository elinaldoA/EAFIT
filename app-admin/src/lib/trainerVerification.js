import { db } from './supabase';

// Verificação de CREF (Pessoas → Verificação de CREF). SQL em
// supabase/migrations/20261128190000_trainer_verification.sql.

// Consulta pública de registrados do CONFEF (busca por nome ou número).
export const CONFEF_URL = 'https://www.confef.org.br/confef/registrados/';

export const STATUS_LABELS = { pendente: 'Pendentes', aprovado: 'Aprovados', recusado: 'Recusados' };
export const STATUS_BADGE = { pendente: 'badge badge--warning', aprovado: 'badge badge--ok', recusado: 'badge badge--danger' };

export const REJECT_REASONS = [
  'CREF não encontrado na consulta do CONFEF.',
  'O nome não confere com o registro do CREF.',
  'O registro está inativo ou suspenso.',
];

const ERRORS = {
  reason_required: 'Escreva o motivo da recusa (a pessoa recebe no app).',
  already_decided: 'Este pedido já foi analisado.',
  invalid_cref: 'CREF inválido. Use o formato 012345-G/SP.',
  not_authorized: 'Sem permissão para essa ação.',
};

export function friendlyVerificationError(err) {
  const msg = String(err?.message || '');
  const key = Object.keys(ERRORS).find(k => msg.includes(k));
  return key ? ERRORS[key] : msg;
}

// "012345-G/SP" → { number: '012345', category: 'G', uf: 'SP' }
export function splitCref(cref) {
  const m = /^(\d{6})-([GP])\/([A-Z]{2})$/.exec(cref || '');
  return m ? { number: m[1], category: m[2], uf: m[3] } : null;
}

export function mapRequest(r) {
  return {
    id: r.tr_id, userId: r.tr_user, email: r.tr_email, name: r.tr_name, cref: r.tr_cref, note: r.tr_note || '',
    status: r.tr_status, reason: r.tr_reason || '', createdAt: r.tr_created, decidedAt: r.tr_decided,
    decidedBy: r.tr_decided_by, accountCreated: r.tr_account_created, previous: Number(r.tr_previous) || 0,
  };
}

export async function fetchRequests(status) {
  const { data, error } = await db.rpc('admin_trainer_requests', { p_status: status });
  if (error) throw error;
  return (data || []).map(mapRequest);
}

export async function decideRequest(id, approve, reason = '') {
  const { error } = await db.rpc('admin_decide_trainer_request', { p_id: id, p_approve: approve, p_reason: reason });
  if (error) throw new Error(friendlyVerificationError(error));
}

export async function fetchTrainerCrefs() {
  const { data, error } = await db.rpc('admin_trainer_crefs');
  if (error) throw error;
  return (data || []).map(r => ({ userId: r.tc_user, email: r.tc_email, code: r.tc_code, cref: r.tc_cref, verifiedAt: r.tc_verified_at, since: r.tc_since }));
}

export async function setTrainerCref(userId, cref) {
  const { data, error } = await db.rpc('admin_set_trainer_cref', { p_user: userId, p_cref: cref });
  if (error) throw new Error(friendlyVerificationError(error));
  return data;
}
