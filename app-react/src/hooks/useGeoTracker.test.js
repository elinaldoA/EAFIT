// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGeoTracker } from './useGeoTracker';

let onOk;
let onFail;
const geo = { watchPosition: vi.fn(), clearWatch: vi.fn() };

const fix = (lat, t, accuracy = 5) => ({ coords: { latitude: lat, longitude: 0, accuracy }, timestamp: t });
const send = (...fixes) => act(() => { fixes.forEach(f => onOk(f)); });

beforeEach(() => {
  vi.useFakeTimers();
  geo.watchPosition.mockReset().mockImplementation((ok, fail) => { onOk = ok; onFail = fail; return 7; });
  geo.clearWatch.mockReset();
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
});
afterEach(() => {
  vi.useRealTimers();
  delete navigator.geolocation;
});

describe('useGeoTracker', () => {
  it('parado: não pede o GPS', () => {
    const { result } = renderHook(() => useGeoTracker({ active: false, baseKm: 0, onDistance: vi.fn() }));
    expect(geo.watchPosition).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('ativo: procura sinal, e a primeira leitura só ancora', () => {
    const onDistance = vi.fn();
    const { result } = renderHook(() => useGeoTracker({ active: true, baseKm: 0, onDistance }));
    expect(result.current.status).toBe('searching');
    send(fix(0, 1000));
    expect(result.current.status).toBe('tracking');
    expect(onDistance).not.toHaveBeenCalled();
  });

  it('soma a distância em km a partir da base, arredondada a 10 m', () => {
    const onDistance = vi.fn();
    renderHook(() => useGeoTracker({ active: true, baseKm: 1.5, onDistance }));
    send(fix(0, 0), fix(0.0001, 4000)); // ~11,1 m
    expect(onDistance).toHaveBeenLastCalledWith(1.51);
    send(fix(0.0002, 8000)); // ~22,2 m
    expect(onDistance).toHaveBeenLastCalledWith(1.52);
  });

  it('leitura imprecisa é ignorada (e mostra a precisão da última)', () => {
    const onDistance = vi.fn();
    const { result } = renderHook(() => useGeoTracker({ active: true, baseKm: 0, onDistance }));
    send(fix(0, 0), fix(0.001, 4000, 90));
    expect(onDistance).not.toHaveBeenCalled();
    expect(result.current.accuracy).toBe(90);
  });

  it('pausar solta o GPS; retomar não soma o trecho da pausa', () => {
    const onDistance = vi.fn();
    const { rerender } = renderHook(({ active }) => useGeoTracker({ active, baseKm: 0, onDistance }), { initialProps: { active: true } });
    send(fix(0, 0), fix(0.0001, 4000));
    onDistance.mockClear();
    rerender({ active: false });
    expect(geo.clearWatch).toHaveBeenCalledWith(7);
    rerender({ active: true });
    send(fix(0.5, 900000)); // longe, depois da pausa: nova âncora
    expect(onDistance).not.toHaveBeenCalled();
  });

  it('permissão negada vira status denied; outro erro vira error', () => {
    const { result } = renderHook(() => useGeoTracker({ active: true, baseKm: 0, onDistance: vi.fn() }));
    act(() => onFail({ code: 1 }));
    expect(result.current.status).toBe('denied');
    act(() => onFail({ code: 2 }));
    expect(result.current.status).toBe('error');
  });

  it('sem leitura aceita por 15 s o sinal fica fraco, e volta a rastrear com uma boa', () => {
    const { result } = renderHook(() => useGeoTracker({ active: true, baseKm: 0, onDistance: vi.fn() }));
    send(fix(0, 0));
    expect(result.current.status).toBe('tracking');
    act(() => { vi.advanceTimersByTime(18000); });
    expect(result.current.status).toBe('weak');
    send(fix(0.0001, 30000));
    expect(result.current.status).toBe('tracking');
  });

  it('navegador sem geolocalização', () => {
    delete navigator.geolocation;
    const { result } = renderHook(() => useGeoTracker({ active: true, baseKm: 0, onDistance: vi.fn() }));
    expect(result.current.status).toBe('unsupported');
  });

  it('desmontar solta o GPS', () => {
    const { unmount } = renderHook(() => useGeoTracker({ active: true, baseKm: 0, onDistance: vi.fn() }));
    unmount();
    expect(geo.clearWatch).toHaveBeenCalledWith(7);
  });
});
