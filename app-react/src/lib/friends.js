import { db } from './supabase';
import { trackFeature } from './tracking';
import { FRIEND_INVITE_URL } from './links';

import { t } from './i18n';
export const REACTIONS = ['💪', '🔥', '👏'];

const ERRORS = {
  invalid_code: t('Código não encontrado. Confira com seu amigo.'),
  self_code: t('Esse é o seu próprio código.'),
  too_many_requests: t('Você já tem 20 pedidos pendentes. Aguarde alguém aceitar.'),
  too_many_friends: t('Você chegou ao limite de 100 amigos.'),
  not_authorized: t('Sem permissão para essa ação.'),
};

export function friendlyFriendError(err) {
  const msg = String(err?.message || '');
  const key = Object.keys(ERRORS).find(k => msg.includes(k));
  return key ? ERRORS[key] : t('Não foi possível concluir. Tente de novo.');
}

export function normalizeFriendCode(raw) {
  return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function friendInviteText(code) {
  return t('Bora treinar juntos? 💪 Me adiciona no EAFIT com o código {code} (Dashboard → Amigos) e a gente disputa o ranking da semana. Ainda não tem o app? É grátis: {url}', { code, url: FRIEND_INVITE_URL });
}

// Manda o convite com o código pelo compartilhar do sistema ou, sem ele, copia.
// 'shared' | 'copied' | 'cancelled' (fechou o menu) | 'failed'.
export async function shareFriendCode(code) {
  const text = friendInviteText(code);
  try {
    if (navigator.share) {
      await navigator.share({ title: 'EAFIT', text });
      return 'shared';
    }
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch (err) {
    return err?.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

export async function fetchMyFriendProfile() {
  const { data, error } = await db.rpc('my_friend_profile');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { code: row.fp_code, share: row.fp_share };
}

export async function setShareActivity(share) {
  const { error } = await db.rpc('set_share_activity', { p_share: share });
  if (error) throw error;
}

// 'sent' | 'accepted' | 'already'
export async function requestFriend(code) {
  trackFeature('friends');
  const { data, error } = await db.rpc('request_friend', { p_code: code });
  if (error) throw error;
  return data;
}

export async function respondFriend(id, accept) {
  trackFeature('friends');
  const { error } = await db.rpc('respond_friend', { p_id: id, p_accept: accept });
  if (error) throw error;
}

export async function removeFriendship(id) {
  const { error } = await db.rpc('remove_friendship', { p_id: id });
  if (error) throw error;
}

// status: 'friend' | 'incoming' | 'outgoing'; week = dias treinados em 7 dias
// (null quando o amigo não compartilha).
export async function fetchMyFriends() {
  const { data, error } = await db.rpc('my_friends');
  if (error) throw error;
  return (data || []).map(r => ({ id: r.fr_id, name: r.fr_name, status: r.fr_status, week: r.fr_week }));
}

export async function fetchFeed(limit = 30) {
  const { data, error } = await db.rpc('friend_feed', { p_limit: limit });
  if (error) throw error;
  return (data || []).map(r => ({
    id: r.fd_id, name: r.fd_name, isMe: r.fd_is_me, kind: r.fd_kind, title: r.fd_title,
    detail: r.fd_detail, at: r.fd_at, counts: r.fd_counts || {}, mine: r.fd_mine || null,
  }));
}

export async function reactToEvent(eventId, emoji) {
  trackFeature('friends');
  const { error } = await db.rpc('react_to_event', { p_event: eventId, p_emoji: emoji });
  if (error) throw error;
}

// Publica no feed dos amigos. Não bloqueia nem quebra o fluxo do treino: sem
// internet ou com o compartilhamento desligado, simplesmente não aparece.
export function postActivity(kind, title, detail = null) {
  db.rpc('post_activity', { p_kind: kind, p_title: title, p_detail: detail })
    .then(({ error }) => { if (error) console.error('post_activity:', error); })
    .catch(err => console.error('post_activity:', err));
}

export const KIND_ICON = { treino: '✅', recorde: '🏆', sequencia: '🔥' };

// Ranking semanal entre amigos: quem compartilha, por dias treinados; empate
// divide a mesma posição. Inclui o próprio usuário (myWeek = seus dias).
export function weeklyRanking(friends, myWeek) {
  const rows = [
    { name: t('Você'), week: myWeek, isMe: true },
    ...friends.filter(f => f.status === 'friend' && f.week !== null).map(f => ({ name: f.name, week: f.week, isMe: false })),
  ].sort((a, b) => b.week - a.week || Number(b.isMe) - Number(a.isMe) || a.name.localeCompare(b.name));
  let rank = 0;
  return rows.map((r, i) => {
    if (i === 0 || r.week !== rows[i - 1].week) rank = i + 1;
    return { ...r, rank };
  });
}
