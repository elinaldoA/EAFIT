// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('../context/useAuth', () => ({
  useAuth: () => ({ login: vi.fn(), signup: vi.fn(), requestPasswordReset: vi.fn(), resendConfirmation: vi.fn() }),
}));
vi.mock('../lib/pageVisits', () => ({ recordVisit: vi.fn() }));

afterEach(() => { cleanup(); localStorage.clear(); vi.resetModules(); });

describe('AuthScreen em inglês', () => {
  it('mostra a tela de acesso traduzida e o seletor de idioma', async () => {
    localStorage.setItem('app_lang', 'en');
    vi.resetModules();
    const { default: AuthScreen } = await import('./AuthScreen');
    render(<AuthScreen />);
    expect(screen.getByRole('tab', { name: 'Create account' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(/A workout plan for your goal/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Meet the app/ })).toBeTruthy();
    expect(screen.getByLabelText('Language')).toBeTruthy();
    expect(document.documentElement.lang).toBe('en-US');
  });
});
