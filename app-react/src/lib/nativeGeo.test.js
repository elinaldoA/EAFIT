import { describe, it, expect, vi, beforeEach } from 'vitest';

const plugin = vi.hoisted(() => ({ addWatcher: vi.fn(), removeWatcher: vi.fn() }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => plugin, Capacitor: { isNativePlatform: () => true } }));

import { watchNativePosition } from './nativeGeo';

describe('watchNativePosition', () => {
  let cb;
  beforeEach(() => {
    plugin.addWatcher.mockReset();
    plugin.removeWatcher.mockReset().mockResolvedValue();
    plugin.addWatcher.mockImplementation((_opts, fn) => { cb = fn; return Promise.resolve('w1'); });
  });

  it('pede serviço em segundo plano com notificação e converte a leitura para o formato do navegador', () => {
    const onPos = vi.fn();
    watchNativePosition(onPos, vi.fn());
    expect(plugin.addWatcher.mock.calls[0][0]).toMatchObject({ backgroundMessage: expect.any(String), requestPermissions: true, stale: false });
    cb({ latitude: -23.5, longitude: -46.6, accuracy: 8, altitude: 700, altitudeAccuracy: 3, time: 1234 });
    expect(onPos).toHaveBeenCalledWith({
      coords: { latitude: -23.5, longitude: -46.6, accuracy: 8, altitude: 700, altitudeAccuracy: 3 },
      timestamp: 1234,
    });
  });

  it('traduz permissão negada para code 1 e outros erros para 2', () => {
    const onErr = vi.fn();
    watchNativePosition(vi.fn(), onErr);
    cb(null, { code: 'NOT_AUTHORIZED' });
    cb(null, { code: 'OUTRO' });
    expect(onErr.mock.calls).toEqual([[{ code: 1 }], [{ code: 2 }]]);
  });

  it('para o rastreio e ignora leituras depois de parar', async () => {
    const onPos = vi.fn();
    const stop = watchNativePosition(onPos, vi.fn());
    await Promise.resolve();
    stop();
    expect(plugin.removeWatcher).toHaveBeenCalledWith({ id: 'w1' });
    cb({ latitude: 1, longitude: 1, accuracy: 5, time: 1 });
    expect(onPos).not.toHaveBeenCalled();
  });

  it('remove o watcher mesmo se parar antes de ele ser criado', async () => {
    const stop = watchNativePosition(vi.fn(), vi.fn());
    stop();
    await Promise.resolve(); await Promise.resolve();
    expect(plugin.removeWatcher).toHaveBeenCalledWith({ id: 'w1' });
  });
});
