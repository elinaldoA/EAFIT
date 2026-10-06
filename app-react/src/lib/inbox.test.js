import { describe, it, expect, vi } from 'vitest';
import { timeAgo } from './inbox';

vi.mock('./supabase', () => ({ db: {} }));

describe('timeAgo', () => {
  const now = new Date('2026-10-10T12:00:00Z').getTime();
  const ago = ms => new Date(now - ms).toISOString();

  it('formata por faixa', () => {
    expect(timeAgo(ago(10_000), now)).toBe('agora');
    expect(timeAgo(ago(5 * 60_000), now)).toBe('há 5 min');
    expect(timeAgo(ago(3 * 3600_000), now)).toBe('há 3 h');
    expect(timeAgo(ago(30 * 3600_000), now)).toBe('ontem');
    expect(timeAgo(ago(3 * 86400_000), now)).toBe('há 3 dias');
  });

  it('não quebra com horário no futuro', () => {
    expect(timeAgo(new Date(now + 60_000).toISOString(), now)).toBe('agora');
  });
});
