// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useDeferredRemoval } from './useDeferredRemoval';

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('useDeferredRemoval', () => {
  it('esconde na hora e executa só depois do prazo', () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => {});
    const { result } = renderHook(() => useDeferredRemoval(1000));
    act(() => result.current.schedule('a', run));
    expect(result.current.hidden.has('a')).toBe(true);
    expect(run).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('undo cancela e mostra de novo', () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => {});
    const { result } = renderHook(() => useDeferredRemoval(1000));
    act(() => result.current.schedule('a', run));
    act(() => result.current.undo('a'));
    expect(result.current.hidden.has('a')).toBe(false);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(run).not.toHaveBeenCalled();
  });

  it('ao sair da tela executa o que estava esperando', () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => {});
    const { result, unmount } = renderHook(() => useDeferredRemoval(1000));
    act(() => result.current.schedule('a', run));
    unmount();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
