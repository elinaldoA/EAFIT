import { describe, it, expect } from 'vitest';
import { shouldOfferPush, REOFFER_AFTER_DAYS } from './pushPrompt';

const base = {
  notificationsSupported: true, pushSupported: true, permission: 'default', remindersEnabled: false, dismissedAt: null,
};
const now = new Date('2026-10-10T12:00:00Z').getTime();
const daysAgo = (d) => now - d * 86400000;

describe('shouldOfferPush', () => {
  it('oferece quando está tudo pendente', () => {
    expect(shouldOfferPush({ ...base, now })).toBe(true);
  });

  it('não oferece sem suporte a notificação ou push', () => {
    expect(shouldOfferPush({ ...base, notificationsSupported: false, now })).toBe(false);
    expect(shouldOfferPush({ ...base, pushSupported: false, now })).toBe(false);
  });

  it('não oferece se a permissão já foi decidida', () => {
    expect(shouldOfferPush({ ...base, permission: 'granted', now })).toBe(false);
    expect(shouldOfferPush({ ...base, permission: 'denied', now })).toBe(false);
  });

  it('não oferece se os lembretes já estão ligados', () => {
    expect(shouldOfferPush({ ...base, remindersEnabled: true, now })).toBe(false);
  });

  it('respeita a dispensa recente e volta a oferecer depois do prazo', () => {
    expect(shouldOfferPush({ ...base, dismissedAt: daysAgo(3), now })).toBe(false);
    expect(shouldOfferPush({ ...base, dismissedAt: daysAgo(REOFFER_AFTER_DAYS + 1), now })).toBe(true);
  });
});
