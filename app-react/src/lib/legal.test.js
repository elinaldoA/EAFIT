import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: mockRpc } }));

import { fetchCurrentLegalDate, acceptedDay, needsNewAcceptance } from './legal';
import { inBannerWindow, normalizeConfig, todayInAppZone } from './appConfig';

beforeEach(() => vi.clearAllMocks());

const user = at => ({ id: 'u1', user_metadata: at === undefined ? {} : { termsAcceptedAt: at } });

describe('fetchCurrentLegalDate', () => {
  it('devolve a data, null sem versão e propaga erro', async () => {
    mockRpc.mockResolvedValueOnce({ data: '2026-06-01', error: null });
    expect(await fetchCurrentLegalDate()).toBe('2026-06-01');
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await fetchCurrentLegalDate()).toBeNull();
    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('x') });
    await expect(fetchCurrentLegalDate()).rejects.toThrow('x');
  });
});

describe('acceptedDay', () => {
  it('usa o dia no fuso de São Paulo', () => {
    // 01:00 UTC do dia 2 ainda é dia 1 em São Paulo
    expect(acceptedDay(user('2026-06-02T01:00:00.000Z'))).toBe('2026-06-01');
    expect(acceptedDay(user('lixo'))).toBeNull();
    expect(acceptedDay(user())).toBeNull();
  });
});

describe('needsNewAcceptance', () => {
  it('pede quando aceitou antes da versão em vigor ou nunca aceitou', () => {
    expect(needsNewAcceptance(user('2026-05-31T15:00:00.000Z'), '2026-06-01')).toBe(true);
    expect(needsNewAcceptance(user(), '2026-06-01')).toBe(true);
  });

  it('não pede quando aceitou no dia ou depois, sem versão registrada ou sem usuário', () => {
    expect(needsNewAcceptance(user('2026-06-01T15:00:00.000Z'), '2026-06-01')).toBe(false);
    expect(needsNewAcceptance(user('2026-07-01T15:00:00.000Z'), '2026-06-01')).toBe(false);
    expect(needsNewAcceptance(user(), null)).toBe(false);
    expect(needsNewAcceptance(null, '2026-06-01')).toBe(false);
  });
});

describe('período do aviso', () => {
  it('inBannerWindow respeita início e fim, inclusive nas pontas', () => {
    expect(inBannerWindow('', '', '2026-10-08')).toBe(true);
    expect(inBannerWindow('2026-10-08', '2026-10-10', '2026-10-08')).toBe(true);
    expect(inBannerWindow('2026-10-09', '', '2026-10-08')).toBe(false);
    expect(inBannerWindow('', '2026-10-07', '2026-10-08')).toBe(false);
  });

  it('normalizeConfig desliga o aviso fora do período e ignora data inválida', () => {
    const row = extra => [{ key: 'banner', value: { enabled: true, message: 'Oi', ...extra } }];
    expect(normalizeConfig(row({ startsOn: '2026-10-09' }), '2026-10-08').banner.enabled).toBe(false);
    expect(normalizeConfig(row({ endsOn: '2026-10-09' }), '2026-10-08').banner.enabled).toBe(true);
    expect(normalizeConfig(row({ startsOn: 'amanhã' }), '2026-10-08').banner.enabled).toBe(true);
  });

  it('todayInAppZone', () => {
    expect(todayInAppZone(new Date('2026-10-08T01:00:00Z'))).toBe('2026-10-07');
  });
});
