import { describe, it, expect, beforeEach } from 'vitest';
import { countDone, dismissFirstSteps, isFirstStepsDismissed, isNewAccount } from './firstSteps';

const NOW = Date.parse('2026-10-27T12:00:00Z');

describe('firstSteps', () => {
  beforeEach(() => localStorage.clear());

  it('conta criada há poucos dias é nova; há mais de 14 dias não', () => {
    expect(isNewAccount({ created_at: '2026-10-25T00:00:00Z' }, NOW)).toBe(true);
    expect(isNewAccount({ created_at: '2026-10-01T00:00:00Z' }, NOW)).toBe(false);
    expect(isNewAccount({}, NOW)).toBe(false);
    expect(isNewAccount(null, NOW)).toBe(false);
  });

  it('dispensar vale por usuário', () => {
    expect(isFirstStepsDismissed('a')).toBe(false);
    dismissFirstSteps('a');
    expect(isFirstStepsDismissed('a')).toBe(true);
    expect(isFirstStepsDismissed('b')).toBe(false);
  });

  it('countDone conta só os passos conhecidos', () => {
    expect(countDone({ workout: true, water: false, food: true, reminders: false, outro: true })).toBe(2);
    expect(countDone(null)).toBe(0);
  });
});
