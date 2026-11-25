import { describe, it, expect, vi, beforeEach } from 'vitest';

const ln = vi.hoisted(() => ({
  checkPermissions: vi.fn(), requestPermissions: vi.fn(), schedule: vi.fn(), cancel: vi.fn(), createChannel: vi.fn(),
}));
const native = vi.hoisted(() => ({ on: true }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: ln }));
vi.mock('./native', () => ({ isNative: () => native.on }));

import { showWorkoutNotice, clearWorkoutNotice } from './nativeWorkoutNotice';

beforeEach(() => {
  native.on = true;
  ln.checkPermissions.mockReset().mockResolvedValue({ display: 'granted' });
  ln.requestPermissions.mockReset();
  ln.schedule.mockReset().mockResolvedValue({});
  ln.cancel.mockReset().mockResolvedValue();
  ln.createChannel.mockReset().mockResolvedValue();
});

describe('showWorkoutNotice', () => {
  it('posta notificação fixa e silenciosa, com o canal criado uma vez só', async () => {
    await showWorkoutNotice('Treino', 'Supino · 1/10');
    await showWorkoutNotice('Treino', 'Supino · 2/10');
    expect(ln.createChannel).toHaveBeenCalledTimes(1);
    expect(ln.createChannel.mock.calls[0][0].importance).toBe(2);
    const n = ln.schedule.mock.calls[1][0].notifications[0];
    expect(n).toMatchObject({ id: 9300, body: 'Supino · 2/10', ongoing: true, autoCancel: false, channelId: 'workout-live' });
  });

  it('sem permissão ou fora do app: não posta', async () => {
    ln.checkPermissions.mockResolvedValue({ display: 'denied' });
    await showWorkoutNotice('a', 'b');
    native.on = false;
    await showWorkoutNotice('a', 'b');
    expect(ln.schedule).not.toHaveBeenCalled();
  });
});

describe('clearWorkoutNotice', () => {
  it('cancela só no app', async () => {
    await clearWorkoutNotice();
    expect(ln.cancel).toHaveBeenCalledWith({ notifications: [{ id: 9300 }] });
    native.on = false;
    await clearWorkoutNotice();
    expect(ln.cancel).toHaveBeenCalledTimes(1);
  });
});
