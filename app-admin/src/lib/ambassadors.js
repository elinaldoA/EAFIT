import { db } from './supabase';

// Embaixadores (influenciadores): código + link de divulgação e as contas que
// chegaram por ele. Tabelas e funções em
// supabase/migrations/20261108010000_ambassadors.sql.

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

export const SOURCE_LABELS = {
  instagram: 'Instagram', whatsapp: 'WhatsApp', tiktok: 'TikTok', youtube: 'YouTube',
  facebook: 'Facebook', x: 'X', google: 'Google', direto: 'Direto / sem canal',
  landing: 'Site', 'outro-site': 'Outro site',
};

const ERRORS = {
  invalid_code: 'Código inválido: use de 3 a 30 letras minúsculas, números ou hífen.',
  invalid_name: 'Informe o nome do embaixador.',
  user_not_found: 'Nenhuma conta com esse e-mail.',
  already_ambassador: 'Essa conta já é embaixadora.',
  code_taken: 'Esse código já está em uso.',
  not_found: 'Embaixador não encontrado.',
  not_authorized: 'Seu papel no painel não permite essa ação.',
  ambassador_not_found: 'Embaixador não encontrado.',
  program_not_found: 'Programa não está mais em revisão. Atualize a lista.',
  note_required: 'Escreva o motivo da recusa: ele aparece para o influenciador.',
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
  // is_influencer vem da tabela (o admin lê ambassadors); admin_ambassadors é
  // anterior aos influenciadores. Banco sem a coluna: todos ficam como não.
  const [rows, flags] = await Promise.all([
    rpc('admin_ambassadors', { days_back: days }),
    db.from('ambassadors').select('id, is_influencer').then(({ data, error }) => (error ? [] : data || [])),
  ]);
  const influencer = new Set(flags.filter(f => f.is_influencer).map(f => f.id));
  return (rows || []).map(r => ({
    influencer: influencer.has(r.am_id),
    id: r.am_id, userId: r.am_user, email: r.am_email, name: r.am_name, code: r.am_code,
    active: r.am_active, createdAt: r.am_created,
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
  return r ? { id: r.am_id, name: r.am_name, code: r.am_code, source: r.ar_source, linkedAt: r.ar_linked } : null;
}

export function createAmbassador({ email, name, code }) {
  return rpc('admin_create_ambassador', { p_email: email.trim(), p_name: name.trim(), p_code: code.trim().toLowerCase() });
}

export function updateAmbassador({ id, name, code, active }) {
  return rpc('admin_update_ambassador', { p_id: id, p_name: name.trim(), p_code: code.trim().toLowerCase(), p_active: active });
}

// ---- Influenciadores (supabase/migrations/20261116010000_influencers.sql) ----
// O embaixador promovido a influenciador publica programas no app; cada
// programa (e cada edição) passa pela revisão do admin antes de ir ao ar.

export function influencerPageUrl(code) {
  return `${LANDING_URL}i/?u=${encodeURIComponent(code)}`;
}

export async function setInfluencer(ambassadorId, on) {
  await rpc('admin_set_influencer', { p_ambassador: ambassadorId, p_on: on });
}

export const LEVEL_LABELS = { iniciante: 'Iniciante', intermediario: 'Intermediário', avancado: 'Avançado' };

// status: 'review' (padrão) | 'approved' | 'rejected' | 'editing' | null (todos)
export async function fetchInfluencerPrograms(status = 'review') {
  return ((await rpc('admin_influencer_programs', { p_status: status })) || []).map(r => ({
    id: r.ip_id, ambassadorId: r.ip_ambassador, influencer: r.ip_influencer, code: r.ip_code,
    status: r.ip_status, draft: r.ip_draft, published: r.ip_published, reviewNote: r.ip_review_note,
    hidden: !!r.ip_hidden, adoptions: Number(r.ip_adoptions) || 0, updatedAt: r.ip_updated_at,
  }));
}

export async function reviewInfluencerProgram(id, approve, note = '') {
  await rpc('admin_review_influencer_program', { p_id: id, p_approve: approve, p_note: note || null });
}
