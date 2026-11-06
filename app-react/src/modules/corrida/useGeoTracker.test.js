// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGeoTracker } from './useGeoTracker';

let onPos;
let onErr;

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition: vi.fn((ok, fail) => { onPos = ok; onErr = fail; return 7; }),
      clearWatch: vi.fn(),
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  delete navigator.geolocation;
});

const fix = (accuracy, t = Date.now(), lat = -23.5) => ({ coords: { latitude: lat, longitude: -46.6, accuracy }, timestamp: t });

describe('useGeoTracker', () => {
  it('mostra a precisão enquanto procura e passa a rastrear com leitura boa', () => {
    const { result } = renderHook(() => useGeoTracker({ active: true }));
    expect(result.current.status).toBe('searching');
    act(() => onPos(fix(120)));
    expect(result.current).toEqual({ status: 'searching', accuracy: 120 });
    act(() => onPos(fix(40)));
    expect(result.current).toEqual({ status: 'tracking', accuracy: 40 });
  });

  it('localização aproximada pede a localização precisa', () => {
    const { result } = renderHook(() => useGeoTracker({ active: true }));
    act(() => onPos(fix(1800)));
    expect(result.current.status).toBe('approx');
  });

  it('timeout não vira erro e, depois de 30 s sem sinal bom, mostra a dica', () => {
    const { result } = renderHook(() => useGeoTracker({ active: true }));
    act(() => onErr({ code: 3 }));
    expect(result.current.status).toBe('searching');
    act(() => { vi.advanceTimersByTime(33000); });
    expect(result.current.status).toBe('slow');
    act(() => onPos(fix(10)));
    expect(result.current.status).toBe('tracking');
  });

  it('permissão negada', () => {
    const { result } = renderHook(() => useGeoTracker({ active: true }));
    act(() => onErr({ code: 1 }));
    expect(result.current.status).toBe('denied');
  });

  it('na pausa automática segue a posição sem somar distância e avisa cada leitura', () => {
    const onMeters = vi.fn();
    const onSample = vi.fn();
    const { rerender } = renderHook(p => useGeoTracker({ active: true, baseMeters: 0, onMeters, onSample, ...p }), { initialProps: { paused: false } });
    const t0 = Date.now();
    act(() => onPos(fix(10, t0, -23.5)));
    act(() => onPos(fix(10, t0 + 5000, -23.5001)));   // ~11 m
    expect(onMeters).toHaveBeenLastCalledWith(11);
    rerender({ paused: true });
    act(() => onPos(fix(10, t0 + 10000, -23.5002)));  // anda ~11 m parado no cronômetro
    expect(onMeters).toHaveBeenCalledTimes(1);
    expect(onSample).toHaveBeenLastCalledWith({ t: t0 + 10000, reason: 'moved', meters: expect.closeTo(11.1, 0) });
    rerender({ paused: false });
    act(() => onPos(fix(10, t0 + 15000, -23.5003)));  // a soma recomeça da posição nova
    expect(onMeters).toHaveBeenLastCalledWith(22);
  });

  it('desligado não chama o GPS', () => {
    const { result } = renderHook(() => useGeoTracker({ active: false }));
    expect(result.current.status).toBe('idle');
    expect(navigator.geolocation.watchPosition).not.toHaveBeenCalled();
  });
});
