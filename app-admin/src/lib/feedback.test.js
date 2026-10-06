import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc, mockEq, mockUpdate, mockInvoke } = vi.hoisted(() => {
  const mockEq = vi.fn();
  return { mockRpc: vi.fn(), mockEq, mockUpdate: vi.fn(() => ({ eq: mockEq })), mockInvoke: vi.fn() };
});

vi.mock('./supabase', () => ({
  db: { rpc: mockRpc, from: () => ({ update: mockUpdate }), functions: { invoke: mockInvoke } },
}));

import {
  fetchFeedback, fetchNewFeedbackCount, noteChanged, noteValue, replyValue, replyToFeedback, REPLY_MAX,
} from './feedback';

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

describe('replyValue', () => {
  it('apara e rejeita vazio ou longo demais', () => {
    expect(replyValue('  obrigado!  ')).toBe('obrigado!');
    expect(replyValue('   ')).toBeNull();
    expect(replyValue('x'.repeat(REPLY_MAX + 1))).toBeNull();
  });
});

describe('replyToFeedback', () => {
  const item = { id: 'f1', user_id: 'u1', status: 'novo' };

  it('salva a resposta, marca como resolvido e avisa só o autor', async () => {
    mockEq.mockResolvedValue({ error: null });
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    const out = await replyToFeedback(item, ' Já corrigimos! ', { resolve: true });
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ admin_reply: 'Já corrigimos!', status: 'resolvido' }));
    expect(mockEq).toHaveBeenCalledWith('id', 'f1');
    expect(mockInvoke).toHaveBeenCalledWith('admin-broadcast', {
      body: expect.objectContaining({ body: 'Já corrigimos!', targetUserIds: ['u1'] }),
    });
    expect(out).toEqual({ notified: true });
  });

  it('não altera o status sem resolve e informa quando o aviso falha', async () => {
    mockEq.mockResolvedValue({ error: null });
    mockInvoke.mockResolvedValue({ data: null, error: new Error('x') });
    const out = await replyToFeedback(item, 'ok');
    expect(mockUpdate.mock.calls[0][0]).not.toHaveProperty('status');
    expect(out).toEqual({ notified: false });
  });

  it('rejeita resposta vazia sem gravar nada', async () => {
    await expect(replyToFeedback(item, '  ')).rejects.toThrow();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
