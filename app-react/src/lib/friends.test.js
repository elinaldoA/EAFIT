import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: { rpc: vi.fn() } }));

import { normalizeFriendCode, friendlyFriendError, weeklyRanking, friendInviteText } from './friends';

describe('normalizeFriendCode', () => {
  it('maiúsculas e sem símbolos', () => {
    expect(normalizeFriendCode(' ab-12 cd ')).toBe('AB12CD');
  });
});

describe('friendlyFriendError', () => {
  it('traduz códigos conhecidos e cai num texto genérico', () => {
    expect(friendlyFriendError({ message: 'invalid_code' })).toMatch(/não encontrado/i);
    expect(friendlyFriendError({ message: 'self_code' })).toMatch(/seu próprio/i);
    expect(friendlyFriendError({ message: 'boom' })).toMatch(/Tente de novo/);
  });
});

describe('weeklyRanking', () => {
  it('ordena por dias, empata na mesma posição e ignora quem não compartilha', () => {
    const friends = [
      { name: 'Ana', status: 'friend', week: 4 },
      { name: 'Beto', status: 'friend', week: 2 },
      { name: 'Caio', status: 'friend', week: null },
      { name: 'Duda', status: 'incoming', week: null },
    ];
    const r = weeklyRanking(friends, 2);
    expect(r.map(x => [x.name, x.rank])).toEqual([['Ana', 1], ['Você', 2], ['Beto', 2]]);
  });
});

describe('friendInviteText', () => {
  it('inclui o código', () => {
    expect(friendInviteText('ABC123')).toContain('ABC123');
  });
});
