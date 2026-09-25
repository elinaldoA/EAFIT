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
  mockAuth.getSession.mockResolvedValue({ data: { session: null } });
  mockAuth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  mockAuth.signOut.mockResolvedValue({});
});

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

    expect(response).toEqual({ error: 'Senha: mínimo 6 caracteres.' });
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
});
