import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: (...a) => h.rpc(...a) } }));

import {
  quickLabel, insertReply, friendlyQuickReplyError, fetchQuickReplies, addQuickReply, deleteQuickReply,
  QUICK_LABEL_LEN, STARTER_REPLIES,
} from './trainerQuickReplies';
import { MAX_MESSAGE } from './trainerMessages';

beforeEach(() => h.rpc.mockReset());

describe('quickLabel', () => {
  it('achata espaços e corta com reticências', () => {
    expect(quickLabel('Bom   treino\nhoje')).toBe('Bom treino hoje');
    const long = quickLabel('a'.repeat(100));
    expect(long.length).toBe(QUICK_LABEL_LEN);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('insertReply', () => {
  it('caixa vazia recebe o texto; com texto, acrescenta em nova linha', () => {
    expect(insertReply('', 'Oi')).toBe('Oi');
    expect(insertReply('  ', 'Oi')).toBe('Oi');
    expect(insertReply('Olá  \n', 'Oi')).toBe('Olá\nOi');
  });
  it('nunca passa do limite de um recado', () => {
    expect(insertReply('x'.repeat(MAX_MESSAGE - 2), 'abcdef').length).toBe(MAX_MESSAGE);
  });
});

describe('RPCs', () => {
  it('lista, salva e apaga', async () => {
    h.rpc.mockResolvedValueOnce({ data: [{ qr_id: 'q1', qr_body: 'Oi' }], error: null });
    expect(await fetchQuickReplies()).toEqual([{ id: 'q1', body: 'Oi' }]);
    expect(h.rpc).toHaveBeenLastCalledWith('trainer_quick_replies');
    h.rpc.mockResolvedValueOnce({ data: 'q2', error: null });
    expect(await addQuickReply('Novo')).toBe('q2');
    expect(h.rpc).toHaveBeenLastCalledWith('trainer_add_quick_reply', { p_body: 'Novo' });
    h.rpc.mockResolvedValueOnce({ error: null });
    await deleteQuickReply('q1');
    expect(h.rpc).toHaveBeenLastCalledWith('trainer_delete_quick_reply', { p_id: 'q1' });
  });
  it('propaga o erro do banco', async () => {
    h.rpc.mockResolvedValue({ data: null, error: new Error('too_many') });
    await expect(addQuickReply('x')).rejects.toThrow('too_many');
  });
});

describe('textos', () => {
  it('erros amigáveis e sugestões iniciais', () => {
    expect(friendlyQuickReplyError(new Error('too_many'))).toContain('20 respostas prontas');
    expect(friendlyQuickReplyError(new Error('boom'))).toContain('Não foi possível');
    expect(STARTER_REPLIES.length).toBeGreaterThan(0);
    for (const r of STARTER_REPLIES) expect(r.length).toBeLessThanOrEqual(MAX_MESSAGE);
  });
});
