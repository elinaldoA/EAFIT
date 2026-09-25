import { describe, it, expect } from 'vitest';
import { translateAuthError, isEmailNotConfirmed, GENERIC_AUTH_ERROR } from './authErrors';

describe('translateAuthError', () => {
  it('traduz pelo code quando disponível', () => {
    expect(translateAuthError({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe('E-mail ou senha inválidos.');
    expect(translateAuthError({ code: 'user_already_exists', message: 'User already registered' })).toMatch(/Já existe uma conta/);
  });

  it('cai pro texto da mensagem quando não há code', () => {
    expect(translateAuthError({ message: 'Email not confirmed' })).toMatch(/Confirme seu e-mail/);
    expect(translateAuthError({ message: 'For security purposes, you can only request this after 42 seconds.' })).toMatch(/Aguarde/);
    expect(translateAuthError(new TypeError('Failed to fetch'))).toMatch(/Sem conexão/);
  });

  it('nunca repassa texto técnico em inglês — usa mensagem genérica', () => {
    expect(translateAuthError({ message: 'Database error saving new user' })).toBe(GENERIC_AUTH_ERROR);
  });

  it('retorna null sem erro', () => {
    expect(translateAuthError(null)).toBeNull();
  });
});

describe('isEmailNotConfirmed', () => {
  it('reconhece pelo code e pela mensagem', () => {
    expect(isEmailNotConfirmed({ code: 'email_not_confirmed' })).toBe(true);
    expect(isEmailNotConfirmed({ message: 'Email not confirmed' })).toBe(true);
    expect(isEmailNotConfirmed({ code: 'invalid_credentials' })).toBe(false);
  });
});
