// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { calls } = vi.hoisted(() => ({ calls: { upsert: [], delete: [], error: null, rows: [] } }));
vi.mock('./supabase', () => ({
  db: {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ order: () => Promise.resolve({ data: calls.rows, error: null }) }) }) }),
      upsert: row => { calls.upsert.push(row); return Promise.resolve({ error: calls.error }); },
      delete: () => ({ eq: (_c, id) => ({ eq: () => { calls.delete.push(id); return Promise.resolve({ error: calls.error }); } }) }),
    }),
  },
}));

import { mealForHour, addEntry, updateEntry, removeEntry, fetchEntries, readCachedEntries } from './nutritionEntries';
import { queueSize, enqueue } from './syncQueue';

const D = '2026-12-12';
const ovo = { icon: '🥚', label: 'Ovo', g: 6, kcal: 70, carbs: 1, fat: 5 };

beforeEach(() => {
  localStorage.clear();
  calls.upsert = []; calls.delete = []; calls.error = null; calls.rows = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('nutritionEntries', () => {
  it('sugere a refeição pela hora', () => {
    expect([6, 12, 16, 20, 22].map(mealForHour)).toEqual(['cafe', 'almoco', 'lanche', 'jantar', 'ceia']);
  });

  it('addEntry guarda no aparelho e grava na nuvem com o id dado', async () => {
    const list = await addEntry('u1', D, ovo, 'cafe', 'e1');
    expect(list).toEqual([expect.objectContaining({ id: 'e1', meal: 'cafe', label: 'Ovo' })]);
    expect(readCachedEntries(D)).toHaveLength(1);
    expect(calls.upsert[0]).toMatchObject({ id: 'e1', user_id: 'u1', log_date: D, meal: 'cafe', name: 'Ovo', protein_g: 6, kcal: 70 });
    expect(queueSize()).toBe(0);
  });

  it('grava fibra e sódio quando vierem e null quando não', async () => {
    await addEntry('u1', D, { ...ovo, fiber: 0.04, sodium: 72.6 }, 'cafe', 'e1');
    await addEntry('u1', D, ovo, 'cafe', 'e2');
    expect(calls.upsert[0]).toMatchObject({ fiber_g: 0, sodium_mg: 73 });
    expect(calls.upsert[1]).toMatchObject({ fiber_g: null, sodium_mg: null });
  });

  it('sem rede, enfileira o registro; editar o mesmo registro mantém uma operação', async () => {
    calls.error = new Error('offline');
    await addEntry('u1', D, ovo, 'cafe', 'e1');
    await updateEntry('u1', D, 'e1', { kcal: 80 });
    expect(queueSize()).toBe(1);
    expect(readCachedEntries(D)[0].kcal).toBe(80);
  });

  it('removeEntry tira da lista e, sem rede, enfileira a exclusão', async () => {
    await addEntry('u1', D, ovo, 'cafe', 'e1');
    calls.error = new Error('offline');
    expect(await removeEntry('u1', D, 'e1')).toEqual([]);
    expect(queueSize()).toBe(1);
  });

  it('fetchEntries troca o cache pelo servidor, exceto com fila pendente', async () => {
    calls.rows = [{ id: 's1', meal: 'almoco', name: 'Arroz', icon: '🍚', protein_g: 3, kcal: 130, carbs_g: 28, fat_g: 0 }];
    expect((await fetchEntries('u1', D))[0].id).toBe('s1');

    await addEntry('u1', D, ovo, 'cafe', 'e2');
    enqueue('entry_save', { userId: 'u1', row: { id: 'e2' } });
    const list = await fetchEntries('u1', D);
    expect(list.map(e => e.id)).toEqual(['s1', 'e2']);
  });
});
