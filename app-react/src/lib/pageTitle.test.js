// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { pageTitle, setPageTitle } from './pageTitle';

describe('pageTitle', () => {
  it('junta a tela e a marca', () => {
    expect(pageTitle('Água', 'EAFIT')).toBe('Água · EAFIT');
    expect(pageTitle('Treino', 'EAFIT · Run')).toBe('Treino · EAFIT · Run');
  });

  it('sem nome de tela não tem título próprio', () => {
    expect(pageTitle(null, 'EAFIT')).toBeNull();
  });

  it('setPageTitle grava no documento e cai no título padrão sem tela', () => {
    setPageTitle('Perfil', 'EAFIT', 'EAFIT — Treino');
    expect(document.title).toBe('Perfil · EAFIT');
    setPageTitle(null, 'EAFIT', 'EAFIT — Treino');
    expect(document.title).toBe('EAFIT — Treino');
  });
});
