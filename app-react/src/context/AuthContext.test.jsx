// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const { mockAuth, mockFunctions } = vi.hoisted(() => ({
  mockAuth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    updateUser: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    resend: vi.fn(),
    verifyOtp: vi.fn(),
  },
  mockFunctions: { invoke: vi.fn() },
}));

vi.mock('../lib/supabase', () => ({
  db: { auth: mockAuth, functions: mockFunctions },
}));

import * as adminGuard from '../lib/adminGuard';
import { AuthProvider } from './AuthContext';
import { useAuth } from './useAuth';

function wrapper({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
  mockAuth.getSession.mockResolvedValue({ data: { session: null } });
  mockAuth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});

describe('AuthProvider', () => {
  it('começa com authLoading=true e resolve pra user=null sem sessão', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.authLoading).toBe(true);

    await waitFor(() => expect(result.current.authLoading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it('getSession falhando não trava authLoading em true pra sempre', async () => {
    mockAuth.getSession.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.authLoading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it('login com sucesso seta o usuário', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    mockAuth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    let response;
    await act(async () => {
      response = await result.current.login('a@b.com', 'segredo123');
    });

    expect(response).toEqual({});
    expect(result.current.user).toEqual({ id: 'u1' });
  });

  it('login com credenciais inválidas retorna erro em português e não seta usuário', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    mockAuth.signInWithPassword.mockResolvedValue({ data: null, error: { message: 'Invalid credentials' } });
    let response;
    await act(async () => {
      response = await result.current.login('a@b.com', 'errada');
    });

    expect(response).toEqual({ error: 'E-mail ou senha inválidos.' });
    expect(result.current.user).toBeNull();
  });

  it('signup recusa senha curta antes de chamar o backend', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    let response;
    await act(async () => {
      response = await result.current.signup('a@b.com', '123');
    });

    expect(response).toEqual({ error: 'Senha: mínimo 6 caracteres.' });
    expect(mockAuth.signUp).not.toHaveBeenCalled();
  });

  it('signup sem sessão imediata (confirmação por e-mail) não seta usuário', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    mockAuth.signUp.mockResolvedValue({ data: { session: null, user: { id: 'u2' } }, error: null });
    let response;
    await act(async () => {
      response = await result.current.signup('a@b.com', 'segredo123');
    });

    expect(response).toEqual({ success: 'Conta criada! Enviamos um link de confirmação para o seu e-mail.' });
    expect(result.current.user).toBeNull();
  });

  it('signup com e-mail que já tem conta (identities vazio) avisa em vez de fingir sucesso', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    mockAuth.signUp.mockResolvedValue({ data: { session: null, user: { id: 'u2', identities: [] } }, error: null });
    let response;
    await act(async () => {
      response = await result.current.signup('a@b.com', 'segredo123');
    });

    expect(response.error).toMatch(/Já existe uma conta/);
  });

  it('login com e-mail não confirmado sinaliza needsConfirmation', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    mockAuth.signInWithPassword.mockResolvedValue({ data: null, error: { code: 'email_not_confirmed', message: 'Email not confirmed' } });
    let response;
    await act(async () => {
      response = await result.current.login('a@b.com', 'segredo123');
    });

    expect(response.needsConfirmation).toBe(true);
    expect(response.error).toMatch(/Confirme seu e-mail/);
  });

  it('requestPasswordReset manda o link de volta pro app e não revela se a conta existe', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    mockAuth.resetPasswordForEmail.mockResolvedValue({ error: null });
    let response;
    await act(async () => {
      response = await result.current.requestPasswordReset('a@b.com');
    });

    expect(mockAuth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.com', { redirectTo: window.location.origin + window.location.pathname });
    expect(response.success).toMatch(/Se houver uma conta/);
  });

  it('evento PASSWORD_RECOVERY liga recoveryMode e finishRecovery desliga', async () => {
    let authCallback;
    mockAuth.onAuthStateChange.mockImplementation(cb => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    act(() => authCallback('PASSWORD_RECOVERY', { user: { id: 'u1' } }));
    expect(result.current.recoveryMode).toBe(true);
    await waitFor(() => expect(result.current.user).toEqual({ id: 'u1' }));

    act(() => result.current.finishRecovery());
    expect(result.current.recoveryMode).toBe(false);
  });

  it('link de e-mail: troca o código pela sessão antes de liberar a tela', async () => {
    window.history.replaceState(null, '', '/app/?token_hash=abc&type=recovery');
    let authCallback;
    mockAuth.onAuthStateChange.mockImplementation(cb => {
      authCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    let finishVerify;
    mockAuth.verifyOtp.mockReturnValue(new Promise(resolve => { finishVerify = resolve; }));
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(mockAuth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc', type: 'recovery' });
    expect(window.location.search).toBe('');
    // A sessão inicial (vazia) não libera a tela de acesso antes da hora.
    act(() => authCallback('INITIAL_SESSION', null));
    expect(result.current.authLoading).toBe(true);
    expect(mockAuth.getSession).not.toHaveBeenCalled();

    mockAuth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    await act(async () => {
      authCallback('PASSWORD_RECOVERY', { user: { id: 'u1' } });
      finishVerify({ error: null });
    });
    await waitFor(() => expect(result.current.authLoading).toBe(false));
    expect(result.current.recoveryMode).toBe(true);
    expect(result.current.user).toEqual({ id: 'u1' });
    expect(result.current.linkError).toBe('');
  });

  it('link de e-mail expirado: fica sem sessão e guarda o motivo', async () => {
    window.history.replaceState(null, '', '/app/?token_hash=velho&type=recovery');
    mockAuth.verifyOtp.mockResolvedValue({ error: { code: 'otp_expired', message: 'Email link is invalid or has expired' } });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.authLoading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.recoveryMode).toBe(false);
    expect(result.current.linkError).toMatch(/expirou ou já foi usado/);
  });

  it('logout limpa o usuário', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    mockAuth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    await act(async () => { await result.current.login('a@b.com', 'segredo123'); });
    expect(result.current.user).toEqual({ id: 'u1' });

    mockAuth.signOut.mockResolvedValue({});
    await act(async () => { await result.current.logout(); });
    expect(result.current.user).toBeNull();
  });

  it('deleteAccount sem usuário logado retorna erro sem chamar a edge function', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    let response;
    await act(async () => {
      response = await result.current.deleteAccount();
    });

    expect(response).toEqual({ error: 'Não autenticado.' });
    expect(mockFunctions.invoke).not.toHaveBeenCalled();
  });
});

describe('AuthProvider — conta de administrador', () => {
  it('login de admin derruba a sessão e não entra no app', async () => {
    vi.spyOn(adminGuard, 'isAdminAccount').mockResolvedValue(true);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    mockAuth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'adm' } }, error: null });
    let response;
    await act(async () => { response = await result.current.login('adm@b.com', 'segredo123'); });

    expect(response.error).toMatch(/administrador/);
    expect(mockAuth.signOut).toHaveBeenCalled();
    expect(result.current.user).toBeNull();
  });

  it('sessão de admin já existente no aparelho é encerrada ao abrir o app', async () => {
    vi.spyOn(adminGuard, 'isAdminAccount').mockResolvedValue(true);
    mockAuth.getSession.mockResolvedValue({ data: { session: { user: { id: 'adm' } } } });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.authLoading).toBe(false));
    expect(mockAuth.signOut).toHaveBeenCalled();
    expect(result.current.user).toBeNull();
  });
});
