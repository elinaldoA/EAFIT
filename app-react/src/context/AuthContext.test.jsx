// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const { mockAuth, mockFunctions } = vi.hoisted(() => ({
  mockAuth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInWithPassword: vi.fn(),
    signInWithOAuth: vi.fn(),
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
import * as accountStatus from '../lib/accountStatus';
import * as ambassadorRef from '../lib/ambassadorRef';
import * as trainerInvite from '../lib/trainerInvite';
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

  it('loginWithGoogle manda para o Google e volta para o app', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    mockAuth.signInWithOAuth.mockResolvedValue({ data: {}, error: null });
    let response;
    await act(async () => { response = await result.current.loginWithGoogle(); });

    expect(response).toEqual({});
    expect(mockAuth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
  });

  it('loginWithGoogle devolve erro em português quando o Supabase recusa', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    mockAuth.signInWithOAuth.mockResolvedValue({ data: null, error: { message: 'provider is not enabled' } });
    let response;
    await act(async () => { response = await result.current.loginWithGoogle(); });

    expect(response).toEqual({ error: 'Não foi possível entrar com o Google. Tente de novo.' });
  });

  it('volta do Google com conta nova: grava aceite dos termos e manda boas-vindas', async () => {
    vi.spyOn(adminGuard, 'isAdminAccount').mockResolvedValue(false);
    vi.spyOn(accountStatus, 'isAccountDeactivated').mockResolvedValue(false);
    const fresh = {
      id: 'g1', created_at: new Date().toISOString(),
      app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: {},
    };
    const updated = { ...fresh, user_metadata: { termsAcceptedAt: 'agora' } };
    mockAuth.getSession.mockResolvedValue({ data: { session: { user: fresh } } });
    mockAuth.updateUser.mockResolvedValue({ data: { user: updated }, error: null });
    mockFunctions.invoke.mockResolvedValue({});

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    expect(mockAuth.updateUser).toHaveBeenCalledWith({ data: expect.objectContaining({ termsAcceptedAt: expect.any(String) }) });
    expect(mockFunctions.invoke).toHaveBeenCalledWith('send-welcome');
    expect(result.current.user).toEqual(updated);
  });

  it('volta do Google com link de embaixador/personal: manda ref e personal e limpa o que ficou guardado', async () => {
    vi.spyOn(adminGuard, 'isAdminAccount').mockResolvedValue(false);
    vi.spyOn(accountStatus, 'isAccountDeactivated').mockResolvedValue(false);
    const pendingRef = vi.spyOn(ambassadorRef, 'pendingRef').mockReturnValue({ code: 'ana', source: 'insta' });
    const clearRef = vi.spyOn(ambassadorRef, 'clearRef').mockImplementation(() => {});
    const pendingPersonal = vi.spyOn(trainerInvite, 'pendingPersonalInvite').mockReturnValue('ABC123');
    const fresh = {
      id: 'g4', created_at: new Date().toISOString(),
      app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: {},
    };
    mockAuth.getSession.mockResolvedValue({ data: { session: { user: fresh } } });
    mockAuth.updateUser.mockResolvedValue({ data: { user: fresh }, error: null });
    mockFunctions.invoke.mockResolvedValue({});

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    expect(mockAuth.updateUser).toHaveBeenCalledWith({
      data: expect.objectContaining({ ref: 'ana', refSource: 'insta', personal: 'ABC123' }),
    });
    expect(clearRef).toHaveBeenCalled();
    // Sem restaurar, os valores falsos vazam para os testes seguintes.
    pendingRef.mockRestore(); clearRef.mockRestore(); pendingPersonal.mockRestore();
  });

  it('volta do Google com conta que já aceitou os termos: não grava de novo', async () => {
    vi.spyOn(adminGuard, 'isAdminAccount').mockResolvedValue(false);
    vi.spyOn(accountStatus, 'isAccountDeactivated').mockResolvedValue(false);
    const known = {
      id: 'g2', created_at: new Date().toISOString(),
      app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: { termsAcceptedAt: '2026-01-01T00:00:00Z' },
    };
    mockAuth.getSession.mockResolvedValue({ data: { session: { user: known } } });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    expect(mockAuth.updateUser).not.toHaveBeenCalled();
    expect(mockFunctions.invoke).not.toHaveBeenCalled();
    expect(result.current.user).toEqual(known);
  });

  it('volta do Google e a gravação falha: entra mesmo assim e tenta de novo depois', async () => {
    vi.spyOn(adminGuard, 'isAdminAccount').mockResolvedValue(false);
    vi.spyOn(accountStatus, 'isAccountDeactivated').mockResolvedValue(false);
    const fresh = {
      id: 'g3', created_at: new Date().toISOString(),
      app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: {},
    };
    mockAuth.getSession.mockResolvedValue({ data: { session: { user: fresh } } });
    mockAuth.updateUser.mockResolvedValue({ data: null, error: { message: 'network' } });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    expect(result.current.user).toEqual(fresh);
    expect(mockFunctions.invoke).not.toHaveBeenCalled();
  });

  it('signup recusa senha curta antes de chamar o backend', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    let response;
    await act(async () => {
      response = await result.current.signup('a@b.com', '123');
    });

    expect(response).toEqual({ error: 'Senha: mínimo 8 caracteres.' });
    expect(mockAuth.signUp).not.toHaveBeenCalled();
  });

  it('signup recusa senha acima do limite do Supabase (72) antes de chamar o backend', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    let response;
    await act(async () => {
      response = await result.current.signup('a@b.com', 'x'.repeat(73));
    });

    expect(response).toEqual({ error: 'Senha: máximo 72 caracteres.' });
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
    expect(mockFunctions.invoke).not.toHaveBeenCalled();
  });

  it('signup com sessão imediata seta o usuário e pede o e-mail de boas-vindas', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    mockAuth.signUp.mockResolvedValue({ data: { session: { user: { id: 'u3' } }, user: { id: 'u3' } }, error: null });
    // Falha no e-mail não atrapalha o cadastro.
    mockFunctions.invoke.mockRejectedValue(new Error('offline'));
    let response;
    await act(async () => {
      response = await result.current.signup('a@b.com', 'segredo123');
    });

    expect(response).toEqual({});
    expect(result.current.user).toEqual({ id: 'u3' });
    expect(mockFunctions.invoke).toHaveBeenCalledWith('send-welcome');
  });

  it('signup leva o código do link de embaixador e limpa depois', async () => {
    localStorage.setItem('eafit_ref', JSON.stringify({ code: 'anafit', source: 'whatsapp', at: Date.now() }));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    mockAuth.signUp.mockResolvedValue({ data: { session: null, user: { id: 'u4' } }, error: null });
    await act(async () => {
      await result.current.signup('a@b.com', 'segredo123');
    });

    expect(mockAuth.signUp.mock.calls.at(-1)[0].options.data).toMatchObject({ ref: 'anafit', refSource: 'whatsapp' });
    expect(localStorage.getItem('eafit_ref')).toBeNull();
  });

  it('signup leva a origem da chegada (utm) e limpa depois', async () => {
    localStorage.setItem('eafit_utm', JSON.stringify({ source: 'instagram', campaign: 'outubro_rosa', medium: 'story', content: '', at: Date.now() }));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    mockAuth.signUp.mockResolvedValue({ data: { session: null, user: { id: 'u5' } }, error: null });
    await act(async () => {
      await result.current.signup('c@d.com', 'segredo123');
    });

    expect(mockAuth.signUp.mock.calls.at(-1)[0].options.data.utm).toEqual({ source: 'instagram', campaign: 'outubro_rosa', medium: 'story', content: '' });
    expect(localStorage.getItem('eafit_utm')).toBeNull();
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
    expect(response.existingAccount).toBe(true);
  });

  it('signup recusado pelo servidor porque o e-mail já existe também pede a volta ao login', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    mockAuth.signUp.mockResolvedValue({ data: null, error: { code: 'user_already_exists', message: 'User already registered' } });
    let response;
    await act(async () => {
      response = await result.current.signup('a@b.com', 'segredo123');
    });

    expect(response.existingAccount).toBe(true);
    expect(response.error).toMatch(/Já existe uma conta/);
  });

  it('signup com outro erro (ex.: rede) não manda a pessoa para o login', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.authLoading).toBe(false));

    mockAuth.signUp.mockResolvedValue({ data: null, error: { code: 'over_email_send_rate_limit', message: 'rate limit' } });
    let response;
    await act(async () => {
      response = await result.current.signup('a@b.com', 'segredo123');
    });

    expect(response.existingAccount).toBe(false);
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

describe('AuthProvider — conta desativada', () => {
  // O spy do bloco de admin acima continua valendo entre os testes.
  beforeEach(() => { vi.spyOn(adminGuard, 'isAdminAccount').mockResolvedValue(false); });

  it('sessão já aberta no aparelho é encerrada ao abrir o app, com o motivo na tela de acesso', async () => {
    vi.spyOn(accountStatus, 'isAccountDeactivated').mockResolvedValue(true);
    mockAuth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.authLoading).toBe(false));
    expect(mockAuth.signOut).toHaveBeenCalled();
    expect(result.current.user).toBeNull();
    expect(result.current.linkError).toMatch(/foi desativada/);
  });

  it('desativada com o app aberto: voltar para a tela encerra a sessão', async () => {
    const check = vi.spyOn(accountStatus, 'isAccountDeactivated').mockResolvedValue(false);
    mockAuth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockAuth.signOut.mockResolvedValue({});
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user).toEqual({ id: 'u1' }));

    // Conta ainda ativa: voltar para a tela não muda nada.
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(result.current.user).toEqual({ id: 'u1' });

    check.mockResolvedValue(true);
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(result.current.user).toBeNull());
    expect(mockAuth.signOut).toHaveBeenCalled();
    expect(result.current.linkError).toMatch(/foi desativada/);
  });
});

describe('perfil guardado só no aparelho', () => {
  it('ao abrir com sessão, os campos que faltam na conta sobem e o usuário é atualizado', async () => {
    vi.spyOn(adminGuard, 'isAdminAccount').mockResolvedValue(false);
    vi.spyOn(accountStatus, 'isAccountDeactivated').mockResolvedValue(false);
    localStorage.setItem('eafit_data_owner', 'u9');
    localStorage.setItem('profile_nome', 'Ana');
    localStorage.setItem('profile_apelido', 'Aninha');
    mockAuth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u9', user_metadata: { apelido: 'Ana B' } } } } });
    mockAuth.updateUser.mockResolvedValue({ data: { user: { id: 'u9', user_metadata: { nome: 'Ana', apelido: 'Ana B' } } }, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user?.user_metadata?.nome).toBe('Ana'));
    expect(mockAuth.updateUser).toHaveBeenCalledWith({ data: { nome: 'Ana' } });
    localStorage.clear();
  });
});
