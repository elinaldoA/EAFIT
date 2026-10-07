import { describe, it, expect, vi } from 'vitest';
import { toggleId, toggleAll, runBulk, summarize } from './bulkActions';

vi.mock('./supabase', () => ({ db: {} }));
vi.mock('./userDetailHelpers', () => ({ callAdminAction: vi.fn() }));

describe('seleção', () => {
  it('toggleId adiciona e remove sem mutar', () => {
    const a = new Set(['1']);
    const b = toggleId(a, '2');
    expect([...b]).toEqual(['1', '2']);
    expect([...a]).toEqual(['1']);
    expect([...toggleId(b, '1')]).toEqual(['2']);
  });

  it('toggleAll marca todos e depois desmarca, preservando outras páginas', () => {
    const marked = toggleAll(new Set(['x']), ['1', '2']);
    expect([...marked].sort()).toEqual(['1', '2', 'x']);
    expect([...toggleAll(marked, ['1', '2'])]).toEqual(['x']);
  });

  it('toggleAll com página vazia não altera nada', () => {
    expect([...toggleAll(new Set(['x']), [])]).toEqual(['x']);
  });
});

describe('runBulk', () => {
  it('segue o lote mesmo com falhas e reporta cada uma', async () => {
    const fn = vi.fn(async id => { if (id === 'b') throw new Error('boom'); });
    const res = await runBulk(['a', 'b', 'c'], fn);
    expect(res.ok).toBe(2);
    expect(res.failed).toEqual([{ id: 'b', message: 'boom' }]);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('summarize descreve sucesso total e parcial', () => {
    expect(summarize({ ok: 3, failed: [] }, 'Banidos')).toBe('Banidos: 3 usuário(s).');
    expect(summarize({ ok: 1, failed: [{ id: 'x', message: 'falhou' }] }, 'Banidos')).toContain('1 com erro (falhou)');
  });
});
