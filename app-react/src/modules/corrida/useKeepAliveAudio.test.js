// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeepAliveAudio, silentWavBlob } from './useKeepAliveAudio';

describe('useKeepAliveAudio', () => {
  let instances;
  beforeEach(() => {
    instances = [];
    globalThis.Audio = vi.fn(function Audio(src) {
      this.src = src; this.paused = true;
      this.play = vi.fn(() => { this.paused = false; return Promise.resolve(); });
      this.pause = vi.fn(() => { this.paused = true; });
      this.load = vi.fn();
      this.removeAttribute = vi.fn();
      this.setAttribute = vi.fn();
      this.listeners = {};
      this.addEventListener = vi.fn((name, fn) => { this.listeners[name] = fn; });
      this.removeEventListener = vi.fn();
      instances.push(this);
    });
    URL.createObjectURL = vi.fn(() => 'blob:silencio');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => { delete globalThis.Audio; });

  it('gera um WAV válido', async () => {
    const blob = silentWavBlob();
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(44 + 16000);
  });

  it('toca em loop enquanto ligado e para ao desligar', () => {
    const { rerender, unmount } = renderHook(({ on }) => useKeepAliveAudio(on), { initialProps: { on: true } });
    expect(instances).toHaveLength(1);
    expect(instances[0].loop).toBe(true);
    expect(instances[0].play).toHaveBeenCalled();
    rerender({ on: false });
    expect(instances[0].pause).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:silencio');
    unmount();
  });

  it('volta a tocar sozinho se o sistema pausar o áudio', () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useKeepAliveAudio(true));
    const a = instances[0];
    a.play.mockClear();
    a.paused = true;
    a.listeners.pause();
    vi.advanceTimersByTime(1000);
    expect(a.play).toHaveBeenCalled();
    unmount();
    vi.useRealTimers();
  });

  it('não toca desligado', () => {
    renderHook(() => useKeepAliveAudio(false));
    expect(instances).toHaveLength(0);
  });
});
