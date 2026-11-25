import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const hp = vi.hoisted(() => ({ vibrate: vi.fn(), impact: vi.fn() }));
const native = vi.hoisted(() => ({ on: true }));
vi.mock('@capacitor/haptics', () => ({ Haptics: hp, ImpactStyle: { Medium: 'MEDIUM' } }));
vi.mock('./native', () => ({ isNative: () => native.on }));

import { vibratePattern, hapticTap } from './nativeHaptics';

beforeEach(() => {
  native.on = true;
  vi.useFakeTimers();
  hp.vibrate.mockReset().mockResolvedValue();
  hp.impact.mockReset().mockResolvedValue();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('vibratePattern', () => {
  it('no app: vibra nos tempos pares e espera nos ímpares', async () => {
    vibratePattern([100, 50, 200]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(hp.vibrate.mock.calls.map(c => c[0].duration)).toEqual([100, 200]);
  });

  it('uma vibração nova interrompe o padrão anterior', async () => {
    vibratePattern([100, 100, 100, 100, 100]);
    await vi.advanceTimersByTimeAsync(10);
    vibratePattern([300]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(hp.vibrate.mock.calls.map(c => c[0].duration)).toEqual([100, 300]);
  });

  it('no navegador: usa navigator.vibrate', () => {
    native.on = false;
    const vib = vi.fn();
    vi.stubGlobal('navigator', { vibrate: vib });
    vibratePattern([10, 20]);
    expect(vib).toHaveBeenCalledWith([10, 20]);
    expect(hp.vibrate).not.toHaveBeenCalled();
  });

  it('plugin ausente não estoura', async () => {
    hp.vibrate.mockRejectedValue(new Error('x'));
    vibratePattern([100]);
    await vi.advanceTimersByTimeAsync(500);
  });
});

describe('hapticTap', () => {
  it('só no app', () => {
    hapticTap();
    expect(hp.impact).toHaveBeenCalledWith({ style: 'MEDIUM' });
    native.on = false;
    hapticTap();
    expect(hp.impact).toHaveBeenCalledTimes(1);
  });
});
