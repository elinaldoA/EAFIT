// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

const { logout } = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ logout }) }));
vi.mock('../lib/supabase', () => ({ db: { auth: { signInWithPassword: vi.fn() } } }));
vi.mock('../lib/biometricLock', () => ({
  getLock: () => null,
  verifyLock: vi.fn(),
  isCancelled: () => false,
}));

import BiometricLockScreen from './BiometricLockScreen';

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const emailUser = { id: 'u1', email: 'a@b.com', app_metadata: { provider: 'email', providers: ['email'] } };
const googleUser = { id: 'u2', email: 'a@gmail.com', app_metadata: { provider: 'google', providers: ['google'] } };

describe('BiometricLockScreen', () => {
  it('conta com senha: oferece "Usar a senha" como saída sem biometria', () => {
    render(<BiometricLockScreen user={emailUser} onUnlock={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Usar a senha' })).toBeTruthy();
    expect(screen.queryByText(/entre de novo com o Google/)).toBeNull();
  });

  it('conta só do Google: sem opção de senha; explica e oferece sair da conta', () => {
    render(<BiometricLockScreen user={googleUser} onUnlock={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Usar a senha' })).toBeNull();
    expect(screen.getByText(/entre de novo com o Google/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sair da conta' }));
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
