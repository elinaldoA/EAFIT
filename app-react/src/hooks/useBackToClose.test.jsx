// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useBackToClose } from './useBackToClose';

function nextPopState() {
  return new Promise(resolve => window.addEventListener('popstate', resolve, { once: true }));
}

describe('useBackToClose', () => {
  it('fechar um modal pela UI e abrir outro em seguida mantém a entrada do novo', async () => {
    const startLength = window.history.length;
    const closeA = vi.fn();
    const a = renderHook(() => useBackToClose(closeA));
    expect(window.history.length).toBe(startLength + 1);

    // Fecha A pela UI (history.back() assíncrono) e já monta B no mesmo tick —
    // o cenário do modo treino → resumo do treino.
    const settled = nextPopState();
    a.unmount();
    const closeB = vi.fn();
    const b = renderHook(() => useBackToClose(closeB));
    await settled;

    // B só empilha depois do "voltar" de A assentar: fica em cima, sem ter
    // sido consumido por ele.
    await waitFor(() => expect(window.history.state).toEqual({ eafitModal: true }));
    expect(closeA).not.toHaveBeenCalled();
    expect(closeB).not.toHaveBeenCalled();

    // O "voltar" do usuário fecha B (e não sai da página)
    window.history.back();
    await waitFor(() => expect(closeB).toHaveBeenCalledTimes(1));
    b.unmount();
  });

  it('modal desmontado antes de empilhar não gera um "voltar" extra', async () => {
    const a = renderHook(() => useBackToClose(() => {}));
    const settled = nextPopState();
    a.unmount();
    const b = renderHook(() => useBackToClose(() => {}));
    const backSpy = vi.spyOn(window.history, 'back');
    b.unmount(); // ainda pendente: não pode chamar history.back()
    expect(backSpy).not.toHaveBeenCalled();
    backSpy.mockRestore();
    await settled;
  });
});
