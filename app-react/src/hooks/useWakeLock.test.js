// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useWakeLock } from './useWakeLock';

let sentinel;
let request;

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

const flush = () => act(async () => { await Promise.resolve(); });

beforeEach(() => {
  setVisibility('visible');
  sentinel = { released: false, release: vi.fn().mockImplementation(() => { sentinel.released = true; return Promise.resolve(); }) };
  request = vi.fn().mockImplementation(() => Promise.resolve(sentinel));
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
});
afterEach(() => {
  cleanup();
  delete navigator.wakeLock;
  setVisibility('visible');
});

describe('useWakeLock', () => {
  it('pede a trava de tela ao montar e solta ao desmontar', async () => {
    const { unmount } = renderHook(() => useWakeLock());
    await flush();
    expect(request).toHaveBeenCalledWith('screen');
    unmount();
    expect(sentinel.release).toHaveBeenCalled();
  });

  it('desligado não pede nada', async () => {
    renderHook(() => useWakeLock(false));
    await flush();
    expect(request).not.toHaveBeenCalled();
  });

  it('com a aba em segundo plano não pede', async () => {
    setVisibility('hidden');
    renderHook(() => useWakeLock());
    await flush();
    expect(request).not.toHaveBeenCalled();
  });

  it('pede de novo ao voltar para a aba, depois que o navegador soltou a trava', async () => {
    renderHook(() => useWakeLock());
    await flush();
    expect(request).toHaveBeenCalledTimes(1);

    sentinel.released = true;
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('não pede de novo se a trava ainda está ativa', async () => {
    renderHook(() => useWakeLock());
    await flush();
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('sem suporte do navegador, não faz nada e não quebra', async () => {
    delete navigator.wakeLock;
    expect(() => renderHook(() => useWakeLock())).not.toThrow();
  });

  it('pedido negado (economia de bateria) é ignorado', async () => {
    request.mockRejectedValue(new Error('NotAllowed'));
    const { unmount } = renderHook(() => useWakeLock());
    await flush();
    expect(() => unmount()).not.toThrow();
  });

  it('desmontou antes da resposta: solta a trava recebida', async () => {
    let resolve;
    request.mockReturnValue(new Promise(r => { resolve = r; }));
    const { unmount } = renderHook(() => useWakeLock());
    unmount();
    await act(async () => { resolve(sentinel); });
    expect(sentinel.release).toHaveBeenCalled();
  });
});
