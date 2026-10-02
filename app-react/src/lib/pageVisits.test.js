import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInsert } = vi.hoisted(() => ({ mockInsert: vi.fn() }));
vi.mock('./supabase', () => ({ db: { from: () => ({ insert: mockInsert }) } }));

import { detectSource, recordVisit } from './pageVisits';

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

describe('recordVisit', () => {
  beforeEach(() => {
    localStorage.clear();
    mockInsert.mockReset().mockResolvedValue({ error: null });
    globalThis.window = { location: { search: '?origem=convite', hostname: HOST } };
    globalThis.document = { referrer: '' };
  });

  it('grava uma vez por dia por página', async () => {
    expect(await recordVisit('acesso')).toBe(true);
    expect(await recordVisit('acesso')).toBe(false);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith({ page: 'acesso', source: 'convite' });
  });

  it('erro do banco não estoura', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'falhou' } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await recordVisit('acesso')).toBe(false);
    warn.mockRestore();
  });
});
