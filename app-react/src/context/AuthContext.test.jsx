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
  },
  mockFunctions: { invoke: vi.fn() },
}));

vi.mock('../lib/supabase', () => ({
  db: { auth: mockAuth, functions: mockFunctions },
}));

import { AuthProvider } from './AuthContext';
import { useAuth } from './useAuth';

function wrapper({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(result.current.user).toEqual({ id: 'u1' });

    act(() => result.current.finishRecovery());
    expect(result.current.recoveryMode).toBe(false);
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
