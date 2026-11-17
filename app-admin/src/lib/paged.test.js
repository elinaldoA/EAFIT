import { describe, it, expect, vi } from 'vitest';
import { fetchAllRows } from './paged';

// Simula o PostgREST: devolve a fatia pedida do array.
function fakeQuery(all) {
  const range = vi.fn(async (from, to) => ({ data: all.slice(from, to + 1), error: null }));
  return { build: () => ({ range }), range };
}

describe('fetchAllRows', () => {
  it('junta todas as páginas (2.500 linhas em 3 chamadas)', async () => {
    const all = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
    const q = fakeQuery(all);
    const rows = await fetchAllRows(q.build);
    expect(rows).toHaveLength(2500);
    expect(q.range.mock.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('para na primeira quando cabe numa página', async () => {
    const q = fakeQuery([{ id: 1 }]);
    expect(await fetchAllRows(q.build)).toEqual([{ id: 1 }]);
    expect(q.range).toHaveBeenCalledTimes(1);
  });

  it('com exatamente uma página cheia, busca a seguinte (vazia) e termina', async () => {
    const q = fakeQuery(Array.from({ length: 1000 }, (_, i) => ({ id: i })));
    expect(await fetchAllRows(q.build)).toHaveLength(1000);
    expect(q.range).toHaveBeenCalledTimes(2);
  });

  it('propaga o erro do servidor', async () => {
    const build = () => ({ range: async () => ({ data: null, error: new Error('falhou') }) });
    await expect(fetchAllRows(build)).rejects.toThrow('falhou');
  });
});
