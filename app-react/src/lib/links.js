// Endereços públicos do app usados em textos de compartilhamento. ?origem=
// identifica o canal na contagem de visitas (lib/pageVisits.js).
export const LANDING_URL = 'https://eafit.com.br/';
export const SHARE_CARD_URL = `${LANDING_URL}?origem=card`;
export const INVITE_URL = `${LANDING_URL}?origem=convite`;
export const FRIEND_INVITE_URL = `${LANDING_URL}?origem=amigos`;

// Link de embaixador/influenciador: ?ref= liga o cadastro a quem divulgou e
// ?origem= diz o canal (supabase/migrations/20261108010000_ambassadors.sql).
export function ambassadorLink(code, channel = '') {
  const params = new URLSearchParams({ ref: code });
  if (channel) params.set('origem', channel);
  return `${LANDING_URL}?${params}`;
}
