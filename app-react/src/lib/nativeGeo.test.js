import { describe, it, expect, vi, beforeEach } from 'vitest';

const plugin = vi.hoisted(() => ({ addWatcher: vi.fn(), removeWatcher: vi.fn() }));
const notif = vi.hoisted(() => ({ checkPermissions: vi.fn(), requestPermissions: vi.fn() }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: notif }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => plugin, Capacitor: { isNativePlatform: () => true } }));

import { watchNativePosition } from './nativeGeo';

const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

describe('watchNativePosition', () => {
  let cb;
  beforeEach(() => {
    notif.checkPermissions.mockReset().mockResolvedValue({ display: 'granted' });
    notif.requestPermissions.mockReset().mockResolvedValue({ display: 'granted' });
    plugin.addWatcher.mockReset();
    plugin.removeWatcher.mockReset().mockResolvedValue();
    plugin.addWatcher.mockImplementation((_opts, fn) => { cb = fn; return Promise.resolve('w1'); });
  });

  it('pede serviço em segundo plano com notificação e converte a leitura para o formato do navegador', async () => {
    const onPos = vi.fn();
    watchNativePosition(onPos, vi.fn());
    await flush();
    expect(plugin.addWatcher.mock.calls[0][0]).toMatchObject({ backgroundMessage: expect.any(String), requestPermissions: true, stale: false });
    cb({ latitude: -23.5, longitude: -46.6, accuracy: 8, altitude: 700, altitudeAccuracy: 3, time: 1234 });
    expect(onPos).toHaveBeenCalledWith({
      coords: { latitude: -23.5, longitude: -46.6, accuracy: 8, altitude: 700, altitudeAccuracy: 3 },
      timestamp: 1234,
    });
  });

  it('traduz permissão negada para code 1 e outros erros para 2', async () => {
    const onErr = vi.fn();
    watchNativePosition(vi.fn(), onErr);
    await flush();
    cb(null, { code: 'NOT_AUTHORIZED' });
    cb(null, { code: 'OUTRO' });
    expect(onErr.mock.calls).toEqual([[{ code: 1 }], [{ code: 2 }]]);
  });

  it('para o rastreio e ignora leituras depois de parar', async () => {
    const onPos = vi.fn();
    const stop = watchNativePosition(onPos, vi.fn());
    await flush();
    stop();
    expect(plugin.removeWatcher).toHaveBeenCalledWith({ id: 'w1' });
    cb({ latitude: 1, longitude: 1, accuracy: 5, time: 1 });
    expect(onPos).not.toHaveBeenCalled();
  });

  it('se parar antes da permissão responder, nem chega a iniciar o rastreio', async () => {
    const stop = watchNativePosition(vi.fn(), vi.fn());
    stop();
    await flush();
    expect(plugin.addWatcher).not.toHaveBeenCalled();
  });

  it('remove o watcher se parar enquanto ele está sendo criado', async () => {
    let resolveAdd;
    plugin.addWatcher.mockImplementation(() => new Promise(r => { resolveAdd = r; }));
    const stop = watchNativePosition(vi.fn(), vi.fn());
    await flush();
    stop();
    resolveAdd('w2');
    await flush();
    expect(plugin.removeWatcher).toHaveBeenCalledWith({ id: 'w2' });
  });

  it('pergunta a permissão de notificação só se ainda não foi respondida', async () => {
    notif.checkPermissions.mockResolvedValue({ display: 'prompt' });
    watchNativePosition(vi.fn(), vi.fn());
    await flush();
    expect(notif.requestPermissions).toHaveBeenCalledTimes(1);
    notif.requestPermissions.mockClear();
    notif.checkPermissions.mockResolvedValue({ display: 'denied' });
    watchNativePosition(vi.fn(), vi.fn());
    await flush();
    expect(notif.requestPermissions).not.toHaveBeenCalled();
  });

  it('o rastreio inicia mesmo se a permissão de notificação der erro', async () => {
    notif.checkPermissions.mockRejectedValue(new Error('sem plugin'));
    watchNativePosition(vi.fn(), vi.fn());
    await flush();
    expect(plugin.addWatcher).toHaveBeenCalledTimes(1);
  });
});
