import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ln = vi.hoisted(() => ({
  checkPermissions: vi.fn(), requestPermissions: vi.fn(), schedule: vi.fn(), cancel: vi.fn(),
}));
const native = vi.hoisted(() => ({ on: true }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: ln }));
vi.mock('./native', () => ({ isNative: () => native.on }));

import { scheduleNativeRestEnd, cancelNativeRestEnd } from './nativeRest';

beforeEach(() => {
  native.on = true;
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
  ln.checkPermissions.mockReset().mockResolvedValue({ display: 'granted' });
  ln.requestPermissions.mockReset().mockResolvedValue({ display: 'granted' });
  ln.schedule.mockReset().mockResolvedValue({});
  ln.cancel.mockReset().mockResolvedValue();
});
afterEach(() => vi.useRealTimers());

describe('scheduleNativeRestEnd', () => {
  it('agenda a notificação para daqui a N segundos, trocando a anterior', async () => {
    await scheduleNativeRestEnd(90, 'Supino');
    expect(ln.cancel).toHaveBeenCalledTimes(1);
    const [n] = ln.schedule.mock.calls[0][0].notifications;
    expect(n.schedule.at.getTime()).toBe(Date.now() + 90000);
    expect(n.body).toContain('Supino');
  });

  it('fora do app nativo ou sem tempo: não faz nada', async () => {
    native.on = false;
    await scheduleNativeRestEnd(90);
    native.on = true;
    await scheduleNativeRestEnd(0);
    expect(ln.schedule).not.toHaveBeenCalled();
  });

  it('permissão negada: não agenda', async () => {
    ln.checkPermissions.mockResolvedValue({ display: 'denied' });
    await scheduleNativeRestEnd(60);
    expect(ln.schedule).not.toHaveBeenCalled();
  });

  it('erro do plugin não estoura', async () => {
    ln.schedule.mockRejectedValue(new Error('x'));
    await expect(scheduleNativeRestEnd(60)).resolves.toBeUndefined();
  });
});

describe('cancelNativeRestEnd', () => {
  it('cancela só no app nativo', async () => {
    await cancelNativeRestEnd();
    expect(ln.cancel).toHaveBeenCalledTimes(1);
    native.on = false;
    await cancelNativeRestEnd();
    expect(ln.cancel).toHaveBeenCalledTimes(1);
  });
});
