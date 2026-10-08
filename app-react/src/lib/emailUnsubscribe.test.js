// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInvoke, mockRefresh } = vi.hoisted(() => ({ mockInvoke: vi.fn(), mockRefresh: vi.fn() }));
vi.mock('./supabase', () => ({
  db: { functions: { invoke: mockInvoke }, auth: { refreshSession: mockRefresh } },
}));

import { takeUnsubscribeToken, unsubscribeEmail } from './emailUnsubscribe';

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('takeUnsubscribeToken', () => {
  it('lê o código e limpa a barra de endereço, preservando o resto', () => {
    window.history.replaceState(null, '', '/app/?origem=email&descadastro=id.abc#perfil');
    expect(takeUnsubscribeToken()).toBe('id.abc');
    expect(window.location.search).toBe('?origem=email');
    expect(window.location.hash).toBe('#perfil');
  });

  it('sem código devolve null e não mexe em nada', () => {
    window.history.replaceState(null, '', '/app/?origem=card');
    expect(takeUnsubscribeToken()).toBeNull();
    expect(window.location.search).toBe('?origem=card');
  });
});

describe('unsubscribeEmail', () => {
  it('chama a função com o código e atualiza a sessão', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    mockRefresh.mockResolvedValue({});
    expect(await unsubscribeEmail('id.abc')).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith('email-unsubscribe', { body: { token: 'id.abc' } });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('devolve false quando a função recusa ou a rede falha', async () => {
    mockInvoke.mockResolvedValue({ data: { error: 'Link inválido.' }, error: null });
    expect(await unsubscribeEmail('x')).toBe(false);
    mockInvoke.mockResolvedValue({ data: null, error: new Error('400') });
    expect(await unsubscribeEmail('x')).toBe(false);
    mockInvoke.mockRejectedValue(new Error('offline'));
    expect(await unsubscribeEmail('x')).toBe(false);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it('sessão que não atualiza não desfaz o descadastro', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    mockRefresh.mockRejectedValue(new Error('sem sessão'));
    expect(await unsubscribeEmail('id.abc')).toBe(true);
  });
});
