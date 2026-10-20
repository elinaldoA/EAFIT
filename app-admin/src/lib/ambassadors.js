import { db } from './supabase';

// Embaixadores e influenciadores: código + link de divulgação e as contas que
// chegaram por ele. Os dois tipos têm exatamente o mesmo programa; só muda o
// nome. Tabelas e funções em supabase/migrations/20261108010000_ambassadors.sql
// e 20261118010000_ambassador_kind.sql.

export const LANDING_URL = 'https://eafit.com.br/';

// Canal vai no link (?origem=) porque WhatsApp e Instagram quase nunca mandam
// de onde a pessoa veio — sem isso a visita cai como "direto".
export const CHANNELS = [
  { key: '', label: 'Link geral' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'youtube', label: 'YouTube' },
];

export const KINDS = [
  { key: 'embaixador', label: 'Embaixador', plural: 'Embaixadores' },
  { key: 'influenciador', label: 'Influenciador', plural: 'Influenciadores' },
];

export function kindLabel(kind) {
  return kind === 'influenciador' ? 'Influenciador' : 'Embaixador';
}

export const SOURCE_LABELS = {
  instagram: 'Instagram', whatsapp: 'WhatsApp', tiktok: 'TikTok', youtube: 'YouTube',
  facebook: 'Facebook', x: 'X', google: 'Google', direto: 'Direto / sem canal',
  landing: 'Site', 'outro-site': 'Outro site', card: 'Card de treino', qr: 'QR Code',
};

const ERRORS = {
  invalid_code: 'Código inválido: use de 3 a 30 letras minúsculas, números ou hífen.',
  invalid_name: 'Informe o nome.',
  invalid_kind: 'Tipo inválido.',
  user_not_found: 'Nenhuma conta com esse e-mail.',
  already_ambassador: 'Essa conta já é embaixadora ou influenciadora.',
  code_taken: 'Esse código já está em uso.',
  not_found: 'Cadastro não encontrado.',
};

export function ambassadorError(err) {
  const msg = String(err?.message || err || '');
  const key = Object.keys(ERRORS).find(k => msg.includes(k));
  return key ? ERRORS[key] : msg;
}

export function ambassadorLink(code, channel = '') {
  const params = new URLSearchParams({ ref: code });
  if (channel) params.set('origem', channel);
  return `${LANDING_URL}?${params}`;
}

// "Ana Souza Fit" -> "anasouzafit" (sem acento, só o que o banco aceita).
export function suggestCode(name) {
  return String(name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9-]+/g, '').slice(0, 30);
}

export function isValidCode(code) {
  return /^[a-z0-9-]{3,30}$/.test(String(code ?? ''));
}

// % das visitas pelo link que viraram conta (sem visita, sem taxa).
export function conversion(visits, signups) {
  return visits > 0 ? Math.round((signups / visits) * 100) : null;
}

async function rpc(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(ambassadorError(error));
  return data;
}

export async function fetchAmbassadors(days = 30) {
  return ((await rpc('admin_ambassadors', { days_back: days })) || []).map(r => ({
    id: r.am_id, userId: r.am_user, email: r.am_email, name: r.am_name, code: r.am_code,
    active: r.am_active, createdAt: r.am_created, kind: r.am_kind || 'embaixador',
    visits: Number(r.am_visits) || 0, signups: Number(r.am_signups) || 0,
    total: Number(r.am_total) || 0, active7: Number(r.am_active_7d) || 0, lastSignup: r.am_last_signup,
  }));
}

export async function fetchReferrals(ambassadorId) {
  return ((await rpc('admin_ambassador_referrals', { p_ambassador: ambassadorId })) || []).map(r => ({
    userId: r.ar_user, email: r.ar_email, name: r.ar_name, source: r.ar_source, linkedAt: r.ar_linked,
    confirmed: !!r.ar_confirmed, lastSeen: r.ar_last_seen, workouts: Number(r.ar_workouts) || 0,
  }));
}

export async function fetchUserAmbassador(userId) {
  const r = ((await rpc('admin_user_ambassador', { p_user: userId })) || [])[0];
  return r ? { id: r.am_id, name: r.am_name, code: r.am_code, kind: r.am_kind || 'embaixador', source: r.ar_source, linkedAt: r.ar_linked } : null;
}

export function createAmbassador({ email, name, code, kind = 'embaixador' }) {
  return rpc('admin_create_ambassador', { p_email: email.trim(), p_name: name.trim(), p_code: code.trim().toLowerCase(), p_kind: kind });
}

export function updateAmbassador({ id, name, code, active, kind }) {
  return rpc('admin_update_ambassador', { p_id: id, p_name: name.trim(), p_code: code.trim().toLowerCase(), p_active: active, p_kind: kind || null });
}

// Recado da equipe para um grupo do programa, só os ativos (push + aba Recados
// do modo Embaixador/Influenciador). A lista de destinatários é montada no
// servidor (supabase/functions/admin-broadcast, audience 'embaixadores' ou
// 'influenciadores').
export const MESSAGE_TITLE_MAX = 60;
export const MESSAGE_BODY_MAX = 500;

export const MESSAGE_AUDIENCES = [
  { key: 'influenciadores', kind: 'influenciador', label: 'Influenciadores' },
  { key: 'embaixadores', kind: 'embaixador', label: 'Embaixadores' },
];

export async function sendProgramMessage({ title, body, audience }) {
  const { data, error } = await db.functions.invoke('admin-broadcast', {
    body: { title: title.trim(), body: body.trim(), audience },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return { recipients: data?.recipients ?? 0, sent: data?.sent ?? 0 };
}
