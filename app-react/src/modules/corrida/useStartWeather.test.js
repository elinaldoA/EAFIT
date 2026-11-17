// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useStartWeather } from './useStartWeather';

const reply = temp => ({ ok: true, json: async () => ({ current: { temperature_2m: temp, weather_code: 0 } }) });

describe('useStartWeather', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('sem posição não busca nada', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const { result } = renderHook(() => useStartWeather(null));
    expect(result.current).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('com a posição busca o clima de agora uma vez', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply(26));
    vi.stubGlobal('fetch', fetcher);
    const { result, rerender } = renderHook(({ pos }) => useStartWeather(pos), { initialProps: { pos: { lat: -23.5, lon: -46.6 } } });
    await waitFor(() => expect(result.current).toMatchObject({ t: 26 }));
    rerender({ pos: { lat: -23.5, lon: -46.6 } }); // mesma posição em outro objeto
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('falha de rede deixa sem clima, sem erro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { result } = renderHook(() => useStartWeather({ lat: 1, lon: 1 }));
    await new Promise(r => setTimeout(r, 20));
    expect(result.current).toBeNull();
  });
});
