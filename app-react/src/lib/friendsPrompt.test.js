import { describe, it, expect } from 'vitest';
import { shouldOfferFriends, recentlyDismissed, REOFFER_AFTER_DAYS } from './friendsPrompt';

const base = { flagOn: true, friendCount: 0, dismissedAt: null };
const now = new Date('2026-10-10T12:00:00Z').getTime();
const daysAgo = (d) => now - d * 86400000;

describe('shouldOfferFriends', () => {
  it('oferece a quem ainda não tem amigos', () => {
    expect(shouldOfferFriends({ ...base, now })).toBe(true);
  });

  it('não oferece com a função desligada no painel', () => {
    expect(shouldOfferFriends({ ...base, flagOn: false, now })).toBe(false);
  });

  it('não oferece a quem já tem amigo ou pedido pendente', () => {
    expect(shouldOfferFriends({ ...base, friendCount: 1, now })).toBe(false);
  });

  it('respeita a dispensa recente e volta a oferecer depois do prazo', () => {
    expect(shouldOfferFriends({ ...base, dismissedAt: daysAgo(3), now })).toBe(false);
    expect(shouldOfferFriends({ ...base, dismissedAt: daysAgo(REOFFER_AFTER_DAYS + 1), now })).toBe(true);
    expect(recentlyDismissed(null, now)).toBe(false);
  });
});
