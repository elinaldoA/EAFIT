// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHeartRate } from './useHeartRate';

// Cinta falsa: guarda os ouvintes para contar quantos ficam ligados.
function fakeStrap() {
  const chListeners = new Set();
  const devListeners = new Set();
  const ch = {
    addEventListener: (_, fn) => chListeners.add(fn),
    removeEventListener: (_, fn) => chListeners.delete(fn),
    startNotifications: vi.fn().mockResolvedValue(),
  };
  const gatt = {
    connected: false,
    connect: vi.fn(async () => { gatt.connected = true; return { getPrimaryService: async () => ({ getCharacteristic: async () => ch }) }; }),
    disconnect: vi.fn(() => { gatt.connected = false; devListeners.forEach(fn => fn()); }),
  };
  const device = {
    gatt,
    addEventListener: (_, fn) => devListeners.add(fn),
    removeEventListener: (_, fn) => devListeners.delete(fn),
  };
  const send = bpm => chListeners.forEach(fn => fn({ target: { value: new DataView(new Uint8Array([0, bpm]).buffer) } }));
  return { device, gatt, chListeners, devListeners, send };
}

const install = strap => { Object.defineProperty(navigator, 'bluetooth', { value: { requestDevice: vi.fn().mockResolvedValue(strap.device) }, configurable: true }); };
afterEach(() => { delete navigator.bluetooth; vi.useRealTimers(); });

describe('useHeartRate', () => {
  it('conecta, mostra os bpm e soma só com a corrida rodando', async () => {
    const strap = fakeStrap(); install(strap);
    const onFlush = vi.fn();
    const { result, rerender } = renderHook(({ rec }) => useHeartRate(rec, onFlush, 200), { initialProps: { rec: false } });
    await act(async () => { await result.current.connect(); });
    expect(result.current.status).toBe('on');
    act(() => strap.send(150));
    expect(result.current.bpm).toBe(150);
    rerender({ rec: true });
    act(() => { strap.send(130); strap.send(170); });
    act(() => result.current.disconnect());
    expect(onFlush).toHaveBeenCalledTimes(1);
    const [sum, n, max, zones] = onFlush.mock.calls[0];
    expect([sum, n, max]).toEqual([300, 2, 170]);
    expect(zones).toHaveLength(5);
  });

  it('reconectar na mesma cinta não duplica o ouvinte nem conta a leitura duas vezes', async () => {
    const strap = fakeStrap(); install(strap);
    const { result } = renderHook(() => useHeartRate(true, vi.fn(), null));
    await act(async () => { await result.current.connect(); });
    act(() => result.current.disconnect());
    expect(strap.chListeners.size).toBe(0);
    expect(strap.gatt.connected).toBe(false);
    await act(async () => { await result.current.connect(); });
    expect(strap.chListeners.size).toBe(1);
  });

  it('sair da tela enquanto conecta solta a cinta', async () => {
    const strap = fakeStrap(); install(strap);
    let finish;
    strap.gatt.connect = vi.fn(() => new Promise(res => { finish = () => { strap.gatt.connected = true; res({ getPrimaryService: async () => ({ getCharacteristic: async () => ({ addEventListener: () => {}, removeEventListener: () => {}, startNotifications: async () => {} }) }) }); }; }));
    const { result, unmount } = renderHook(() => useHeartRate(true, vi.fn(), null));
    let pending;
    act(() => { pending = result.current.connect(); });
    await act(async () => { await Promise.resolve(); });
    unmount();
    await act(async () => { finish(); await pending; });
    expect(strap.gatt.disconnect).toHaveBeenCalled();
  });

  it('falha depois de conectar também solta a cinta e fica em erro', async () => {
    const strap = fakeStrap(); install(strap);
    strap.device.gatt.connect = vi.fn(async () => { strap.gatt.connected = true; return { getPrimaryService: async () => { throw new Error('sem serviço'); } }; });
    const { result } = renderHook(() => useHeartRate(true, vi.fn(), null));
    await act(async () => { await result.current.connect(); });
    expect(result.current.status).toBe('error');
    expect(strap.gatt.connected).toBe(false);
  });
});
