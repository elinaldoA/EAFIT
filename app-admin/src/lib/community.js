import { db } from './supabase';

async function rpcRows(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data || [];
}

async function rpcVoid(name, args) {
  const { error } = await db.rpc(name, args);
  if (error) throw error;
}

// Mesmos limites de create_challenge / admin_create_official_challenge.
export const TITLE_MIN = 3;
export const TITLE_MAX = 50;
export const MAX_DAYS = 60;
export const DURATION_OPTIONS = [7, 14, 30];

export const FEED_KINDS = [
  { value: '', label: 'Tudo' },
  { value: 'treino', label: 'Treinos' },
  { value: 'recorde', label: 'Recordes' },
  { value: 'sequencia', label: 'Sequências' },
];
export const KIND_LABEL = { treino: 'Treino', recorde: 'Recorde', sequencia: 'Sequência' };

const ERRORS = {
  invalid_title: `O nome precisa ter entre ${TITLE_MIN} e ${TITLE_MAX} letras.`,
  invalid_period: `Período inválido: o fim não pode ser antes do início e o desafio dura no máximo ${MAX_DAYS} dias.`,
  not_found: 'Esse item não existe mais. Atualize a página.',
  not_authorized: 'Sem permissão para essa ação.',
};

export function friendlyCommunityError(err) {
  const msg = String(err?.message || '');
  const key = Object.keys(ERRORS).find(k => msg.includes(k));
  return key ? ERRORS[key] : msg || 'Não foi possível concluir.';
}

// Hoje no fuso do app (America/Sao_Paulo), em YYYY-MM-DD.
export function todayStr(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

export function addDaysStr(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function formatDay(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// 'futuro' | 'ativo' | 'encerrado' (datas YYYY-MM-DD, comparação lexical vale).
export function challengeStatus(c, today) {
  if (today < c.start) return 'futuro';
  if (today > c.end) return 'encerrado';
  return 'ativo';
}

export const STATUS_LABEL = { futuro: 'começa em breve', ativo: 'em andamento', encerrado: 'encerrado' };
export const STATUS_BADGE = { futuro: 'badge--warning', ativo: 'badge--ok', encerrado: '' };

// Valida o formulário do desafio oficial e devolve o período (início + duração).
export function validateOfficialChallenge(title, start, days) {
  const name = String(title || '').trim();
  if (name.length < TITLE_MIN || name.length > TITLE_MAX) return { ok: false, error: ERRORS.invalid_title };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(start || ''))) return { ok: false, error: 'Escolha a data de início.' };
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) return { ok: false, error: ERRORS.invalid_period };
  return { ok: true, title: name, start, end: addDaysStr(start, days - 1) };
}

// % dos participantes que treinaram ao menos um dia no período.
export function participationPct(members, active) {
  const m = Number(members);
  if (!Number.isFinite(m) || m <= 0) return null;
  return Math.round((Number(active) / m) * 100);
}

function mapChallenge(r) {
  return {
    id: r.ac_id, title: r.ac_title, code: r.ac_code, start: r.ac_start, end: r.ac_end,
    official: !!r.ac_official, ownerId: r.ac_owner, ownerEmail: r.ac_owner_email,
    members: Number(r.ac_members), active: Number(r.ac_active), createdAt: r.ac_created,
  };
}

export async function fetchChallenges() {
  return (await rpcRows('admin_list_challenges')).map(mapChallenge);
}

export async function fetchChallengeLeaderboard(id) {
  return (await rpcRows('admin_challenge_leaderboard', { p_id: id })).map(r => ({
    userId: r.al_user, email: r.al_email, name: r.al_name, role: r.al_role, score: Number(r.al_score),
  }));
}

// Devolve o código de convite do desafio criado.
export async function createOfficialChallenge(title, start, end) {
  const { data, error } = await db.rpc('admin_create_official_challenge', { p_title: title, p_start: start, p_end: end });
  if (error) throw error;
  return data;
}

export function deleteChallenge(id) {
  return rpcVoid('admin_delete_challenge', { p_id: id });
}

export async function fetchSocialStats() {
  const r = (await rpcRows('admin_social_stats'))[0];
  if (!r) return null;
  return {
    users: Number(r.ss_users), withFriends: Number(r.ss_with_friends),
    friendships: Number(r.ss_friendships), pending: Number(r.ss_pending),
    sharingOff: Number(r.ss_sharing_off), blocked: Number(r.ss_blocked),
    events7d: Number(r.ss_events_7d), events30d: Number(r.ss_events_30d),
    reactions30d: Number(r.ss_reactions_30d),
    challengesActive: Number(r.ss_challenges_active), challengeUsers: Number(r.ss_challenge_users),
  };
}

export const FEED_PAGE_SIZE = 50;

export async function fetchFeedEvents({ page = 0, kind = '' } = {}) {
  const rows = await rpcRows('admin_feed_events', {
    page_size: FEED_PAGE_SIZE, page_offset: page * FEED_PAGE_SIZE, only_kind: kind || null,
  });
  return {
    total: Number(rows[0]?.total_count ?? 0),
    rows: rows.map(r => ({
      id: r.fe_id, userId: r.fe_user, email: r.fe_email, kind: r.fe_kind, title: r.fe_title,
      detail: r.fe_detail, at: r.fe_at, reactions: Number(r.fe_reactions), blocked: !!r.fe_blocked,
    })),
  };
}

export function deleteFeedEvent(id) {
  return rpcVoid('admin_delete_feed_event', { p_id: id });
}

export function setFeedBlock(userId, blocked) {
  return rpcVoid('admin_set_feed_block', { p_user: userId, p_blocked: blocked });
}

export async function fetchInviteFunnel(days = 30) {
  const r = (await rpcRows('admin_invite_funnel', { days_back: days }))[0];
  if (!r) return null;
  return {
    shareUsers: Number(r.if_share_users), shareDays: Number(r.if_share_days),
    landing: Number(r.if_landing), acesso: Number(r.if_acesso), signups: Number(r.if_signups),
  };
}
