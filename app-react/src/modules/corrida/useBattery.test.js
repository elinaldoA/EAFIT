// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useBattery } from './useBattery';

function fakeBattery(level, charging = false) {
  const ls = {};
  return {
    level, charging,
    addEventListener: (ev, fn) => { (ls[ev] ||= []).push(fn); },
    removeEventListener: (ev, fn) => { ls[ev] = (ls[ev] || []).filter(f => f !== fn); },
    fire: ev => (ls[ev] || []).forEach(f => f()),
    count: () => Object.values(ls).flat().length,
  };
}

describe('useBattery', () => {
  afterEach(() => { delete navigator.getBattery; });

  it('sem suporte do navegador (iPhone, Firefox) fica null', () => {
    const { result } = renderHook(() => useBattery(true));
    expect(result.current).toBeNull();
  });

  it('lê o nível e acompanha as mudanças', async () => {
    const b = fakeBattery(0.42);
    navigator.getBattery = vi.fn().mockResolvedValue(b);
    const { result } = renderHook(() => useBattery(true));
    await waitFor(() => expect(result.current).toEqual({ level: 42, charging: false }));
    b.level = 0.19;
    act(() => b.fire('levelchange'));
    expect(result.current.level).toBe(19);
    b.charging = true;
    act(() => b.fire('chargingchange'));
    expect(result.current.charging).toBe(true);
  });

  it('não lê com a corrida parada e solta os ouvintes ao sair', async () => {
    const b = fakeBattery(0.5);
    navigator.getBattery = vi.fn().mockResolvedValue(b);
    const idle = renderHook(() => useBattery(false));
    expect(idle.result.current).toBeNull();
    expect(navigator.getBattery).not.toHaveBeenCalled();
    const on = renderHook(() => useBattery(true));
    await waitFor(() => expect(on.result.current).not.toBeNull());
    expect(b.count()).toBe(2);
    on.unmount();
    expect(b.count()).toBe(0);
  });

  it('erro ao ler a bateria não quebra', async () => {
    navigator.getBattery = vi.fn().mockRejectedValue(new Error('negado'));
    const { result } = renderHook(() => useBattery(true));
    await new Promise(r => setTimeout(r, 10));
    expect(result.current).toBeNull();
  });
});
