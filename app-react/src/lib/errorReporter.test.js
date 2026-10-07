// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { insert, getSession } = vi.hoisted(() => ({ insert: vi.fn(), getSession: vi.fn() }));
vi.mock('./supabase', () => ({
  db: { auth: { getSession }, from: () => ({ insert }) },
}));

describe('reportError', () => {
  let reportError;
  beforeEach(async () => {
    vi.resetModules();
    insert.mockReset().mockResolvedValue({ error: null });
    getSession.mockReset().mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    ({ reportError } = await import('./errorReporter'));
  });

  it('grava o erro com o usuário e limita o tamanho', async () => {
    await reportError('error', { message: 'x'.repeat(900), stack: 's'.repeat(5000) });
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0];
    expect(row.user_id).toBe('u1');
    expect(row.message).toHaveLength(500);
    expect(row.stack).toHaveLength(2000);
  });

  it('não reenvia o mesmo erro', async () => {
    await reportError('error', new Error('boom'));
    await reportError('error', new Error('boom'));
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('para depois de 10 erros distintos na sessão', async () => {
    for (let i = 0; i < 15; i++) await reportError('error', new Error(`e${i}`));
    expect(insert).toHaveBeenCalledTimes(10);
  });

  it('sem login não grava e nunca lança', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(reportError('error', new Error('anon'))).resolves.toBeUndefined();
    expect(insert).not.toHaveBeenCalled();
    insert.mockRejectedValue(new Error('rede'));
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    await expect(reportError('error', new Error('falha'))).resolves.toBeUndefined();
  });
});
