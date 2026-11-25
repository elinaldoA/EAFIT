import { describe, it, expect, vi, beforeEach } from 'vitest';

const ln = vi.hoisted(() => ({
  checkPermissions: vi.fn(), requestPermissions: vi.fn(), schedule: vi.fn(), cancel: vi.fn(),
}));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: ln }));

import {
  WATER_TIMES, requestNativeNotificationPermission, scheduleNativeWaterReminders,
  cancelNativeWaterReminders, sendNativeNotification,
} from './nativeReminders';

beforeEach(() => {
  ln.checkPermissions.mockReset().mockResolvedValue({ display: 'granted' });
  ln.requestPermissions.mockReset().mockResolvedValue({ display: 'granted' });
  ln.schedule.mockReset().mockResolvedValue({});
  ln.cancel.mockReset().mockResolvedValue();
});

describe('requestNativeNotificationPermission', () => {
  it('já concedida: não pergunta de novo', async () => {
    expect(await requestNativeNotificationPermission()).toBe('granted');
    expect(ln.requestPermissions).not.toHaveBeenCalled();
  });

  it('ainda não respondida: pergunta e devolve a resposta', async () => {
    ln.checkPermissions.mockResolvedValue({ display: 'prompt' });
    ln.requestPermissions.mockResolvedValue({ display: 'denied' });
    expect(await requestNativeNotificationPermission()).toBe('denied');
    expect(ln.requestPermissions).toHaveBeenCalledTimes(1);
  });

  it('negada antes ou erro do plugin: denied, sem perguntar à toa', async () => {
    ln.checkPermissions.mockResolvedValue({ display: 'denied' });
    expect(await requestNativeNotificationPermission()).toBe('denied');
    expect(ln.requestPermissions).not.toHaveBeenCalled();
    ln.checkPermissions.mockRejectedValue(new Error('sem plugin'));
    expect(await requestNativeNotificationPermission()).toBe('denied');
  });
});

describe('scheduleNativeWaterReminders', () => {
  it('cancela os antigos e agenda um por horário, repetindo todo dia', async () => {
    await scheduleNativeWaterReminders();
    expect(ln.cancel).toHaveBeenCalledTimes(1);
    const { notifications } = ln.schedule.mock.calls[0][0];
    expect(notifications).toHaveLength(WATER_TIMES.length);
    expect(notifications[0].schedule).toEqual({ on: { hour: 9, minute: 0 }, allowWhileIdle: true });
    expect(notifications.at(-1).schedule.on).toEqual({ hour: 21, minute: 0 });
    expect(new Set(notifications.map(n => n.id)).size).toBe(WATER_TIMES.length);
    // alarme exato faria o Android abrir a tela "Alarmes e lembretes"
    expect(notifications.every(n => n.isExactNotification === false)).toBe(true);
  });

  it('cancelar não estoura se o plugin falhar', async () => {
    ln.cancel.mockRejectedValue(new Error('x'));
    await expect(cancelNativeWaterReminders()).resolves.toBeUndefined();
  });
});

describe('sendNativeNotification', () => {
  it('manda a notificação na hora quando há permissão', async () => {
    await sendNativeNotification('Oi', { body: 'corpo' });
    expect(ln.schedule.mock.calls[0][0].notifications[0]).toMatchObject({ title: 'Oi', body: 'corpo', isExactNotification: false });
  });

  it('sem permissão: erro e nada é enviado', async () => {
    ln.checkPermissions.mockResolvedValue({ display: 'denied' });
    await expect(sendNativeNotification('Oi')).rejects.toThrow();
    expect(ln.schedule).not.toHaveBeenCalled();
  });
});
