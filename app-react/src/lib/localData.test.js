// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { clearUserLocalData, claimLocalData } from './localData';

beforeEach(() => localStorage.clear());

function seed() {
  localStorage.setItem('set_Supino_1_done', 'true');
  localStorage.setItem('treino_Segunda', 'true');
  localStorage.setItem('profile_peso', '80');
  localStorage.setItem('pendingSyncQueue', '[{"id":"1"}]');
  localStorage.setItem('theme', 'dark');
  localStorage.setItem('app_lang', 'en');
}

describe('clearUserLocalData', () => {
  it('remove cache e fila do usuário, mantém tema e idioma', () => {
    seed();
    clearUserLocalData();
    expect(localStorage.getItem('set_Supino_1_done')).toBeNull();
    expect(localStorage.getItem('treino_Segunda')).toBeNull();
    expect(localStorage.getItem('profile_peso')).toBeNull();
    expect(localStorage.getItem('pendingSyncQueue')).toBeNull();
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(localStorage.getItem('app_lang')).toBe('en');
  });
});

describe('claimLocalData', () => {
  it('sem dono registrado só registra, sem apagar', () => {
    seed();
    claimLocalData('u1');
    expect(localStorage.getItem('set_Supino_1_done')).toBe('true');
  });

  it('mesmo usuário mantém os dados', () => {
    claimLocalData('u1');
    seed();
    claimLocalData('u1');
    expect(localStorage.getItem('treino_Segunda')).toBe('true');
  });

  it('outro usuário no mesmo aparelho começa limpo', () => {
    claimLocalData('u1');
    seed();
    claimLocalData('u2');
    expect(localStorage.getItem('treino_Segunda')).toBeNull();
    expect(localStorage.getItem('pendingSyncQueue')).toBeNull();
    expect(localStorage.getItem('theme')).toBe('dark');
  });
});
