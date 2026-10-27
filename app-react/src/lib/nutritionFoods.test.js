// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { dbMock, calls } = vi.hoisted(() => {
  const calls = { upsert: [], delete: [], error: null, rows: [] };
  const dbMock = {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: calls.rows, error: null }) }) }),
      upsert: row => { calls.upsert.push(row); return Promise.resolve({ error: calls.error }); },
      delete: () => ({ eq: (_c, id) => ({ eq: () => { calls.delete.push(id); return Promise.resolve({ error: calls.error }); } }) }),
    }),
  };
  return { dbMock, calls };
});
vi.mock('./supabase', () => ({ db: dbMock }));

import { fetchCustomFoods, createCustomFood, updateCustomFood, deleteCustomFood, readCachedFoods } from './nutritionFoods';
import { queueSize } from './syncQueue';

const food = { name: ' Tapioca ', g: 2, kcal: 140, carbs: 30, fat: 1 };

beforeEach(() => {
  localStorage.clear();
  calls.upsert = []; calls.delete = []; calls.error = null; calls.rows = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('nutritionFoods', () => {
  it('fetchCustomFoods converte as linhas e guarda a cópia local', async () => {
    calls.rows = [{ id: 'a', name: 'Pão', icon: '🥖', protein_g: 4, kcal: 150, carbs_g: 29, fat_g: 2 }];
    const list = await fetchCustomFoods('u1');
    expect(list[0]).toMatchObject({ id: 'a', custom: true, label: 'Pão', g: 4, kcal: 150 });
    expect(readCachedFoods('u1')[0].label).toBe('Pão');
  });

  it('createCustomFood grava com id do aparelho e atualiza o cache na hora', async () => {
    const list = await createCustomFood('u1', food);
    expect(calls.upsert[0]).toMatchObject({ user_id: 'u1', name: 'Tapioca', protein_g: 2, kcal: 140 });
    expect(calls.upsert[0].id).toBeTruthy();
    expect(list).toHaveLength(1);
    expect(readCachedFoods('u1')[0].label).toBe('Tapioca');
    expect(queueSize()).toBe(0);
  });

  it('sem rede, o atalho aparece e a gravação vai para a fila', async () => {
    calls.error = new Error('offline');
    const list = await createCustomFood('u1', food);
    expect(list).toHaveLength(1);
    expect(queueSize()).toBe(1);
  });

  it('updateCustomFood troca os dados do atalho existente', async () => {
    const [created] = await createCustomFood('u1', food);
    const list = await updateCustomFood('u1', created.id, { ...food, name: 'Tapioca grande', kcal: 200 });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: created.id, label: 'Tapioca grande', kcal: 200 });
    expect(calls.upsert[1].id).toBe(created.id);
  });

  it('deleteCustomFood remove do cache e, sem rede, enfileira a exclusão', async () => {
    const [created] = await createCustomFood('u1', food);
    calls.error = new Error('offline');
    const list = await deleteCustomFood('u1', created.id);
    expect(list).toEqual([]);
    expect(readCachedFoods('u1')).toEqual([]);
    expect(queueSize()).toBe(1);
  });

  it('editar o mesmo atalho várias vezes offline mantém uma só operação', async () => {
    calls.error = new Error('offline');
    const [created] = await createCustomFood('u1', food);
    await updateCustomFood('u1', created.id, { ...food, kcal: 150 });
    await updateCustomFood('u1', created.id, { ...food, kcal: 160 });
    expect(queueSize()).toBe(1);
  });
});
