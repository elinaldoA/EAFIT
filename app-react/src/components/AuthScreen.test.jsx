// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

const auth = vi.hoisted(() => ({ login: vi.fn(), loginWithGoogle: vi.fn(), signup: vi.fn(), requestPasswordReset: vi.fn(), resendConfirmation: vi.fn() }));
vi.mock('../context/useAuth', () => ({ useAuth: () => auth }));

vi.mock('../lib/pageVisits', () => ({ recordVisit: vi.fn() }));

import AuthScreen from './AuthScreen';
import { markKnownUser } from '../lib/knownUser';

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  auth.loginWithGoogle.mockReset().mockResolvedValue({});
});

describe('AuthScreen', () => {
  it('visitante novo cai em "Criar conta", com o convite e o link pra landing', () => {
    render(<AuthScreen />);
    expect(screen.getByRole('tab', { name: 'Criar conta' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(/Plano de treino pro seu objetivo/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Conheça o app/ }).getAttribute('href')).toBe('../');
  });

  it('e-mail sem formato válido não vai pro servidor', () => {
    render(<AuthScreen />);
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@gmail' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(screen.getByText('E-mail inválido.')).toBeTruthy();
    expect(auth.signup).not.toHaveBeenCalled();
  });

  it('aparelho que já teve conta abre em "Entrar", sem o convite', () => {
    markKnownUser();
    render(<AuthScreen />);
    expect(screen.getByRole('tab', { name: 'Entrar' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByText(/Plano de treino pro seu objetivo/)).toBeNull();
    expect(screen.getByRole('link', { name: /Conheça o app/ })).toBeTruthy();
  });

  it('cadastro: o Google exige o mesmo checkbox dos Termos e só há um aceite na tela', () => {
    render(<AuthScreen />);
    expect(screen.getAllByText(/Termos de Uso/)).toHaveLength(1);
    expect(screen.queryByText(/Ao continuar com o Google/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Continuar com o Google/ }));
    expect(screen.getByText('Aceite os Termos de Uso para criar a conta.')).toBeTruthy();
    expect(auth.loginWithGoogle).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.queryByText('Aceite os Termos de Uso para criar a conta.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Continuar com o Google/ }));
    expect(auth.loginWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('entrar: o Google abre direto, com o aviso de aceite sob o botão e sem checkbox', () => {
    markKnownUser();
    render(<AuthScreen />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByText(/Ao continuar com o Google, você aceita os/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Continuar com o Google/ }));
    expect(auth.loginWithGoogle).toHaveBeenCalledTimes(1);
  });
});
