// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useHashTab } from './useHashTab';

const TABS = ['treino', 'historico', 'perfil'];

afterEach(cleanup);

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('useHashTab', () => {
  it('sem hash usa a aba padrão', () => {
    const { result } = renderHook(() => useHashTab(TABS, 'treino'));
    expect(result.current[0]).toBe('treino');
  });

  it('abre direto na aba do hash (atalho do ícone instalado)', () => {
    window.history.replaceState(null, '', '/#perfil');
    const { result } = renderHook(() => useHashTab(TABS, 'treino'));
    expect(result.current[0]).toBe('perfil');
  });

  it('hash desconhecido (ex.: token de recuperação de senha) é ignorado e não é tocado', () => {
    window.history.replaceState(null, '', '/#access_token=abc&type=recovery');
    const { result } = renderHook(() => useHashTab(TABS, 'treino'));
    expect(result.current[0]).toBe('treino');
    expect(window.location.hash).toBe('#access_token=abc&type=recovery');
  });

  it('setTab muda a aba e empilha no histórico', () => {
    const { result } = renderHook(() => useHashTab(TABS, 'treino'));
    const before = window.history.length;
    act(() => result.current[1]('historico'));
    expect(result.current[0]).toBe('historico');
    expect(window.location.hash).toBe('#historico');
    expect(window.history.length).toBe(before + 1);
  });

  it('escolher a aba atual não empilha de novo', () => {
    const { result } = renderHook(() => useHashTab(TABS, 'treino'));
    const before = window.history.length;
    act(() => result.current[1]('treino'));
    expect(window.history.length).toBe(before);
  });

  it('acompanha o "voltar" do navegador (popstate) e mudanças no hash', () => {
    const { result } = renderHook(() => useHashTab(TABS, 'treino'));
    act(() => result.current[1]('perfil'));
    act(() => {
      window.history.replaceState(null, '', '/#historico');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current[0]).toBe('historico');
    act(() => {
      window.history.replaceState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current[0]).toBe('treino');
  });
});
