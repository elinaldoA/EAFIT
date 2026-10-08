import { describe, it, expect } from 'vitest';
import { shouldOfferCoach, REOFFER_AFTER_DAYS } from './coachPrompt';

const base = { available: true, enabled: false, decided: false, dismissedAt: null };
const now = new Date('2026-10-10T12:00:00Z').getTime();
const daysAgo = (d) => now - d * 86400000;

describe('shouldOfferCoach', () => {
  it('oferece a quem pode usar e ainda não ligou', () => {
    expect(shouldOfferCoach({ ...base, now })).toBe(true);
  });

  it('não oferece sem voz em português no aparelho', () => {
    expect(shouldOfferCoach({ ...base, available: false, now })).toBe(false);
  });

  it('não oferece com a voz já ligada nem a quem já decidiu no Perfil', () => {
    expect(shouldOfferCoach({ ...base, enabled: true, now })).toBe(false);
    expect(shouldOfferCoach({ ...base, decided: true, now })).toBe(false);
  });

  it('respeita a dispensa recente e volta a oferecer depois do prazo', () => {
    expect(shouldOfferCoach({ ...base, dismissedAt: daysAgo(3), now })).toBe(false);
    expect(shouldOfferCoach({ ...base, dismissedAt: daysAgo(REOFFER_AFTER_DAYS + 1), now })).toBe(true);
  });
});
