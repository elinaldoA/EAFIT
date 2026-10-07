import { describe, it, expect, vi, beforeEach } from 'vitest';

const { chain } = vi.hoisted(() => ({ chain: {} }));
vi.mock('./supabase', () => ({ db: { from: () => chain } }));

import { fetchClientErrors, purgeOldClientErrors } from './clientErrors';

beforeEach(() => {
  chain.select = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.range = vi.fn(() => Promise.resolve({ data: [{ id: 1 }], error: null, count: 120 }));
  chain.delete = vi.fn(() => chain);
  chain.lt = vi.fn(() => Promise.resolve({ error: null, count: 7 }));
});

describe('clientErrors', () => {
  it('pagina do mais recente para o mais antigo e devolve o total', async () => {
    const res = await fetchClientErrors({ page: 2, pageSize: 50 });
    expect(chain.range).toHaveBeenCalledWith(100, 149);
    expect(res).toEqual({ rows: [{ id: 1 }], total: 120 });
  });

  it('propaga o erro do banco', async () => {
    chain.range.mockResolvedValue({ data: null, error: new Error('rls'), count: null });
    await expect(fetchClientErrors()).rejects.toThrow('rls');
  });

  it('limpa só o que passou do prazo e devolve quantos foram', async () => {
    const removed = await purgeOldClientErrors(30);
    expect(removed).toBe(7);
    const cutoff = new Date(chain.lt.mock.calls[0][1]).getTime();
    expect(Date.now() - cutoff).toBeGreaterThan(29 * 86400000);
    expect(Date.now() - cutoff).toBeLessThan(31 * 86400000);
  });
});
