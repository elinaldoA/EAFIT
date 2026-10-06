import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock('./supabase', () => ({ db: { rpc: mockRpc } }));

import { fetchFeedback, fetchNewFeedbackCount, noteChanged, noteValue } from './feedback';

beforeEach(() => vi.clearAllMocks());

describe('fetchFeedback', () => {
  it('chama a RPC com filtros e paginação e devolve total e novos', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'f1', total_count: '7', novos: '3' }], error: null });
    const out = await fetchFeedback({ status: 'novo', kind: 'problema', page: 2 });
    expect(mockRpc).toHaveBeenCalledWith('admin_list_feedback', {
      status_filter: 'novo', kind_filter: 'problema', page_size: 50, page_offset: 100,
    });
    expect(out).toMatchObject({ total: 7, novos: 3 });
  });

  it('filtros vazios viram null; sem linhas, total e novos zeram', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const out = await fetchFeedback();
    expect(mockRpc).toHaveBeenCalledWith('admin_list_feedback', expect.objectContaining({ status_filter: null, kind_filter: null }));
    expect(out).toEqual({ rows: [], total: 0, novos: 0 });
  });

  it('propaga erro', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not_authorized' } });
    await expect(fetchFeedback()).rejects.toMatchObject({ message: 'not_authorized' });
  });
});

describe('fetchNewFeedbackCount', () => {
  it('devolve a contagem de novos', async () => {
    mockRpc.mockResolvedValue({ data: [{ total_count: 1, novos: 4 }], error: null });
    expect(await fetchNewFeedbackCount()).toBe(4);
  });

  it('devolve 0 se a consulta falhar (ex.: migration ainda não aplicada)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } });
    expect(await fetchNewFeedbackCount()).toBe(0);
  });
});

describe('notas', () => {
  it('noteChanged ignora espaços e nulos', () => {
    expect(noteChanged(null, '  ')).toBe(false);
    expect(noteChanged('a', 'a ')).toBe(false);
    expect(noteChanged('a', 'b')).toBe(true);
  });

  it('noteValue vazio vira null', () => {
    expect(noteValue('   ')).toBeNull();
    expect(noteValue(' ok ')).toBe('ok');
  });
});
