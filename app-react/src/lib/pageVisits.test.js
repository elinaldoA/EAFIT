import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInsert } = vi.hoisted(() => ({ mockInsert: vi.fn() }));
vi.mock('./supabase', () => ({ db: { from: () => ({ insert: mockInsert }) } }));

import { detectSource, detectOS, recordVisit } from './pageVisits';

const HOST = 'elinaldoa.github.io';

describe('detectSource', () => {
  it('prioriza ?origem= e depois ?utm_source=', () => {
    expect(detectSource('?origem=card&utm_source=google', '', HOST)).toBe('card');
    expect(detectSource('?utm_source=Instagram', '', HOST)).toBe('instagram');
  });

  it('limpa valores fora do formato aceito pelo banco', () => {
    expect(detectSource('?origem=Grupo Academia!', '', HOST)).toBe('grupoacademia');
    expect(detectSource(`?origem=${'a'.repeat(60)}`, '', HOST)).toHaveLength(40);
  });

  it('classifica pelo domínio do referrer', () => {
    expect(detectSource('', 'https://www.google.com.br/', HOST)).toBe('google');
    expect(detectSource('', 'https://l.instagram.com/?u=x', HOST)).toBe('instagram');
    expect(detectSource('', 'https://t.co/abc', HOST)).toBe('x');
    expect(detectSource('', 'https://exemplo.com/post', HOST)).toBe('outro-site');
  });

  it('mesmo site = veio da landing; sem referrer = direto', () => {
    expect(detectSource('', 'https://elinaldoa.github.io/EAFIT/landing/', HOST)).toBe('landing');
    expect(detectSource('', '', HOST)).toBe('direto');
    expect(detectSource('', 'não é url', HOST)).toBe('direto');
  });
});

describe('detectOS', () => {
  const UA = {
    android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36',
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1',
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15',
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
    linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
    chromeos: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
  };

  it('classifica celular e desktop', () => {
    expect(detectOS(UA.android, 'Linux armv81', 5)).toBe('android');
    expect(detectOS(UA.iphone, 'iPhone', 5)).toBe('ios');
    expect(detectOS(UA.mac, 'MacIntel', 0)).toBe('mac');
    expect(detectOS(UA.windows, 'Win32', 0)).toBe('windows');
    expect(detectOS(UA.linux, 'Linux x86_64', 0)).toBe('linux');
  });

  it('iPad que se apresenta como Mac conta como iOS (tem toque)', () => {
    expect(detectOS(UA.mac, 'MacIntel', 5)).toBe('ios');
  });

  it('o que não reconhece vira "outro"', () => {
    expect(detectOS(UA.chromeos, 'Linux x86_64', 0)).toBe('outro');
    expect(detectOS('', '', 0)).toBe('outro');
    expect(detectOS(undefined)).toBe('outro');
  });
});

describe('recordVisit', () => {
  beforeEach(() => {
    localStorage.clear();
    mockInsert.mockReset().mockResolvedValue({ error: null });
    globalThis.window = { location: { search: '?origem=convite', hostname: HOST } };
    globalThis.document = { referrer: '' };
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/126.0', platform: 'Linux armv81', maxTouchPoints: 5 });
  });

  it('grava uma vez por dia por página', async () => {
    expect(await recordVisit('acesso')).toBe(true);
    expect(await recordVisit('acesso')).toBe(false);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith({ page: 'acesso', source: 'convite', os: 'android' });
  });

  it('banco sem a coluna de sistema: grava sem ela', async () => {
    mockInsert.mockResolvedValueOnce({ error: { message: 'column "os" does not exist' } });
    expect(await recordVisit('acesso')).toBe(true);
    expect(mockInsert).toHaveBeenLastCalledWith({ page: 'acesso', source: 'convite' });
  });

  it('erro do banco não estoura', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'falhou' } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await recordVisit('acesso')).toBe(false);
    warn.mockRestore();
  });
});
