// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { upsert, enqueue } = vi.hoisted(() => ({ upsert: vi.fn(), enqueue: vi.fn() }));
vi.mock('./supabase', () => ({
  db: { from: () => ({ upsert: (...args) => upsert(...args) }) },
}));
vi.mock('./tracking', () => ({ trackFeature: () => {} }));
vi.mock('./syncQueue', () => ({ enqueue }));

import { addWaterMl } from './waterLog';
import { waterStorageKey } from '../data/treinoData';

beforeEach(() => {
  localStorage.clear();
  upsert.mockReset().mockResolvedValue({ error: null });
  enqueue.mockReset();
});

describe('addWaterMl', () => {
  it('soma no consumo do dia e salva na conta', () => {
    localStorage.setItem(waterStorageKey(), '500');
    expect(addWaterMl({ id: 'u1' }, 200)).toBe(700);
    expect(localStorage.getItem(waterStorageKey())).toBe('700');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u1', amount_ml: 700 }), expect.anything());
  });
  it('sem rede, vai para a fila', async () => {
    upsert.mockResolvedValue({ error: new Error('offline') });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onQueued = vi.fn();
    addWaterMl({ id: 'u1' }, 200, onQueued);
    await vi.waitFor(() => expect(onQueued).toHaveBeenCalled());
    expect(enqueue).toHaveBeenCalledWith('water_log', expect.objectContaining({ userId: 'u1', amountMl: 200 }));
  });
  it('sem conta, guarda só no aparelho', () => {
    expect(addWaterMl(null, 200)).toBe(200);
    expect(upsert).not.toHaveBeenCalled();
  });
});
