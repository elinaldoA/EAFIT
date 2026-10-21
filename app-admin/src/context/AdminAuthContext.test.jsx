// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const { mockAuth, mockFrom } = vi.hoisted(() => ({
  mockAuth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    updateUser: vi.fn(),
    verifyOtp: vi.fn(),
    mfa: {
      getAuthenticatorAssuranceLevel: vi.fn(),
      listFactors: vi.fn(),
      enroll: vi.fn(),
      unenroll: vi.fn(),
      challengeAndVerify: vi.fn(),
    },
  },
  mockFrom: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  db: { auth: mockAuth, from: mockFrom },
}));

import { AdminAuthProvider } from './AdminAuthContext';
import { useAdminAuth } from './useAdminAuth';

function wrapper({ children }) {
  return <AdminAuthProvider>{children}</AdminAuthProvider>;
}

function mockProfile(isAdmin) {
  mockFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: { is_admin: isAdmin }, error: null }),
      }),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
  mockAuth.getSession.mockResolvedValue({ data: { session: null } });
  mockAuth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  mockAuth.signOut.mockResolvedValue({});
  // Padrão: sessão já com a segunda etapa (os testes de MFA trocam isto).
  mockAuth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal2' }, error: null });
});

async function loginAs(result, id) {
  mockAuth.signInWithPassword.mockResolvedValue({ data: { user: { id } }, error: null });
  await act(async () => { await result.current.login('admin@eafit.com', 'segredo123'); });
}

describe('AdminAuthProvider', () => {
  it('começa com authLoading=true e resolve pra adminUser=null sem sessão', async () => {
    const { result } = renderHook(() => useAdminAuth(), { wrapper });
    expect(result.current.authLoading).toBe(true);

    await waitFor(() => expect(result.current.authLoading).toBe(false));
    expect(result.current.adminUser).toBeNull();
  });

  it('login com is_admin=true seta adminUser', async () => {
    mockProfile(true);
    const { result } = renderHook(() => useAdminAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    mockAuth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    let response;
    await act(async () => {
      response = await result.current.login('admin@eafit.com', 'segredo123');
    });

    expect(response).toEqual({});
    expect(result.current.adminUser).toEqual({ id: 'u1' });
    expect(mockAuth.signOut).not.toHaveBeenCalled();
  });

  it('login com is_admin=false derruba a sessão e nega acesso', async () => {
    mockProfile(false);
    const { result } = renderHook(() => useAdminAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    mockAuth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u2' } }, error: null });
    let response;
    await act(async () => {
      response = await result.current.login('aluno@eafit.com', 'segredo123');
    });

    expect(response).toEqual({ error: 'Esta conta não tem acesso ao backoffice.' });
    expect(result.current.adminUser).toBeNull();
    expect(mockAuth.signOut).toHaveBeenCalled();
  });

  it('login com credenciais inválidas retorna erro em português', async () => {
    const { result } = renderHook(() => useAdminAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    mockAuth.signInWithPassword.mockResolvedValue({ data: null, error: { message: 'Invalid credentials' } });
    let response;
    await act(async () => {
      response = await result.current.login('a@b.com', 'errada');
    });

    expect(response).toEqual({ error: 'E-mail ou senha inválidos.' });
    expect(result.current.adminUser).toBeNull();
  });

  it('link de e-mail: troca o código pela sessão e entra em recoveryMode', async () => {
    window.history.replaceState(null, '', '/admin/?token_hash=abc&type=recovery');
    mockProfile(true);
    let authCallback;
    mockAuth.onAuthStateChange.mockImplementation(cb => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    let finishVerify;
    mockAuth.verifyOtp.mockReturnValue(new Promise(resolve => { finishVerify = resolve; }));
    const { result } = renderHook(() => useAdminAuth(), { wrapper });

    expect(mockAuth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc', type: 'recovery' });
    expect(window.location.search).toBe('');
    // A sessão inicial (vazia) não libera o login antes da hora.
    act(() => authCallback('INITIAL_SESSION', null));
    expect(result.current.authLoading).toBe(true);

    mockAuth.getSession.mockResolvedValue({ data: { session: { user: { id: 'a1' } } } });
    await act(async () => {
      authCallback('PASSWORD_RECOVERY', { user: { id: 'a1' } });
      finishVerify({ error: null });
    });
    await waitFor(() => expect(result.current.authLoading).toBe(false));
    expect(result.current.recoveryMode).toBe(true);
    expect(result.current.adminUser).toEqual({ id: 'a1' });
    expect(result.current.linkError).toBe('');
  });

  it('link de e-mail expirado: fica sem sessão e guarda o motivo', async () => {
    window.history.replaceState(null, '', '/admin/?token_hash=velho&type=recovery');
    mockAuth.verifyOtp.mockResolvedValue({ error: { code: 'otp_expired' } });
    const { result } = renderHook(() => useAdminAuth(), { wrapper });

    await waitFor(() => expect(result.current.authLoading).toBe(false));
    expect(result.current.adminUser).toBeNull();
    expect(result.current.linkError).toMatch(/expirou ou já foi usado/);
  });

  it('logout limpa o adminUser', async () => {
    mockProfile(true);
    const { result } = renderHook(() => useAdminAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    mockAuth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    await act(async () => { await result.current.login('admin@eafit.com', 'segredo123'); });
    expect(result.current.adminUser).toEqual({ id: 'u1' });

    await act(async () => { await result.current.logout(); });
    expect(result.current.adminUser).toBeNull();
  });

  it('updateProfile atualiza os metadados e o adminUser', async () => {
    mockProfile(true);
    const { result } = renderHook(() => useAdminAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    mockAuth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    await act(async () => { await result.current.login('admin@eafit.com', 'segredo123'); });

    mockAuth.updateUser.mockResolvedValue({ data: { user: { id: 'u1', user_metadata: { nome: 'Ana' } } }, error: null });
    let response;
    await act(async () => {
      response = await result.current.updateProfile({ nome: 'Ana' });
    });

    expect(mockAuth.updateUser).toHaveBeenCalledWith({ data: { nome: 'Ana' } });
    expect(response).toEqual({ error: undefined });
    expect(result.current.adminUser).toEqual({ id: 'u1', user_metadata: { nome: 'Ana' } });
  });

  it('updatePassword rejeita senha curta sem chamar a API', async () => {
    const { result } = renderHook(() => useAdminAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    let response;
    await act(async () => {
      response = await result.current.updatePassword('123');
    });

    expect(response).toEqual({ error: 'Senha: mínimo 8 caracteres.' });
    expect(mockAuth.updateUser).not.toHaveBeenCalled();
  });

  it('updatePassword chama updateUser com a nova senha', async () => {
    const { result } = renderHook(() => useAdminAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    mockAuth.updateUser.mockResolvedValue({ data: {}, error: null });
    let response;
    await act(async () => {
      response = await result.current.updatePassword('novaSenha123');
    });

    expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: 'novaSenha123' });
    expect(response).toEqual({ error: undefined });
  });

  describe('segunda etapa', () => {
    beforeEach(() => {
      mockProfile(true);
      mockAuth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1' }, error: null });
    });

    it('primeiro acesso: só senha não entra e abre o cadastro do autenticador', async () => {
      mockAuth.mfa.listFactors.mockResolvedValue({
        data: { totp: [], all: [{ id: 'velho', factor_type: 'totp', status: 'unverified' }] }, error: null,
      });
      mockAuth.mfa.unenroll.mockResolvedValue({ error: null });
      mockAuth.mfa.enroll.mockResolvedValue({
        data: { id: 'f1', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'ABC123' } }, error: null,
      });
      const { result } = renderHook(() => useAdminAuth(), { wrapper });
      await waitFor(() => expect(result.current.authLoading).toBe(false));

      await loginAs(result, 'u1');

      expect(result.current.adminUser).toBeNull();
      expect(mockAuth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'velho' });
      expect(result.current.mfa).toEqual({ stage: 'enroll', factorId: 'f1', qr: 'data:image/svg+xml;utf-8,<svg/>', secret: 'ABC123' });
    });

    it('com autenticador cadastrado pede o código e libera depois de confirmar', async () => {
      mockAuth.mfa.listFactors.mockResolvedValue({ data: { totp: [{ id: 'f9', status: 'verified' }], all: [] }, error: null });
      const { result } = renderHook(() => useAdminAuth(), { wrapper });
      await waitFor(() => expect(result.current.authLoading).toBe(false));

      await loginAs(result, 'u1');
      expect(result.current.mfa).toEqual({ stage: 'verify', factorId: 'f9' });
      expect(mockAuth.mfa.enroll).not.toHaveBeenCalled();

      mockAuth.mfa.challengeAndVerify.mockResolvedValue({ error: { message: 'Invalid TOTP code entered' } });
      let response;
      await act(async () => { response = await result.current.verifySecondFactor('000000'); });
      expect(response.error).toMatch(/Código inválido/);
      expect(result.current.adminUser).toBeNull();

      mockAuth.mfa.challengeAndVerify.mockResolvedValue({ error: null });
      await act(async () => { response = await result.current.verifySecondFactor('123 456'); });
      expect(mockAuth.mfa.challengeAndVerify).toHaveBeenLastCalledWith({ factorId: 'f9', code: '123456' });
      expect(response).toEqual({});
      expect(result.current.mfa).toBeNull();
      expect(result.current.adminUser).toEqual({ id: 'u1' });
    });

    it('sessão guardada sem a segunda etapa não abre o painel', async () => {
      mockAuth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
      mockAuth.mfa.listFactors.mockResolvedValue({ data: { totp: [{ id: 'f9', status: 'verified' }], all: [] }, error: null });
      const { result } = renderHook(() => useAdminAuth(), { wrapper });

      await waitFor(() => expect(result.current.authLoading).toBe(false));
      expect(result.current.adminUser).toBeNull();
      expect(result.current.mfa).toEqual({ stage: 'verify', factorId: 'f9' });
    });

    it('falha ao abrir a verificação mostra erro e sair limpa tudo', async () => {
      mockAuth.mfa.listFactors.mockResolvedValue({ data: null, error: { message: 'mfa disabled' } });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const { result } = renderHook(() => useAdminAuth(), { wrapper });
      await waitFor(() => expect(result.current.authLoading).toBe(false));

      await loginAs(result, 'u1');
      expect(result.current.mfa).toEqual({ stage: 'error' });

      await act(async () => { await result.current.logout(); });
      expect(result.current.mfa).toBeNull();
      expect(result.current.adminUser).toBeNull();
    });
  });
});
