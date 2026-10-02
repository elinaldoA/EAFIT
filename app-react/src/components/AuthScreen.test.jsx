// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('../context/useAuth', () => ({
  useAuth: () => ({ login: vi.fn(), signup: vi.fn(), requestPasswordReset: vi.fn(), resendConfirmation: vi.fn() }),
}));

vi.mock('../lib/pageVisits', () => ({ recordVisit: vi.fn() }));

import AuthScreen from './AuthScreen';
import { markKnownUser } from '../lib/knownUser';

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
});

describe('AuthScreen', () => {
  it('visitante novo cai em "Criar conta", com o convite e o link pra landing', () => {
    render(<AuthScreen />);
    expect(screen.getByRole('tab', { name: 'Criar conta' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(/Plano de treino pro seu objetivo/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Conheça o app/ }).getAttribute('href')).toBe('landing/');
  });

  it('aparelho que já teve conta abre em "Entrar", sem o convite', () => {
    markKnownUser();
    render(<AuthScreen />);
    expect(screen.getByRole('tab', { name: 'Entrar' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByText(/Plano de treino pro seu objetivo/)).toBeNull();
    expect(screen.getByRole('link', { name: /Conheça o app/ })).toBeTruthy();
  });
});
