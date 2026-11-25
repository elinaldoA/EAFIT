// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  perm: vi.fn(), register: vi.fn(), unregister: vi.fn(), schedule: vi.fn(), cancel: vi.fn(), webSub: vi.fn(), webUnsub: vi.fn(),
}));
vi.mock('../lib/native', () => ({ isNative: () => true }));
vi.mock('../lib/notifications', () => ({ requestNotificationPermission: h.perm }));
vi.mock('../lib/nativePush', () => ({ registerNativePush: h.register, unregisterNativePush: h.unregister }));
vi.mock('../lib/nativeReminders', () => ({ scheduleNativeWaterReminders: h.schedule, cancelNativeWaterReminders: h.cancel }));
vi.mock('../lib/pushSubscriptions', () => ({ subscribeToPush: h.webSub, unsubscribeFromPush: h.webUnsub }));

import { useReminders } from './useReminders';

const user = { id: 'u1' };

beforeEach(() => {
  localStorage.clear();
  Object.values(h).forEach(f => f.mockReset());
  h.perm.mockResolvedValue('granted');
  h.schedule.mockResolvedValue();
  h.cancel.mockResolvedValue();
  h.unregister.mockResolvedValue();
});

describe('useReminders no app Android', () => {
  it('ligar com FCM funcionando: usa o push do servidor e tira a água local (senão duplica)', async () => {
    h.register.mockResolvedValue('tok');
    const toast = vi.fn();
    const { result } = renderHook(() => useReminders(toast, user));
    await act(async () => { await result.current[1](); });
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem('reminders_enabled')).toBe('true');
    expect(h.cancel).toHaveBeenCalled();
    expect(h.schedule).not.toHaveBeenCalled();
    expect(h.webSub).not.toHaveBeenCalled();
  });

  it('ligar sem FCM: cai nos lembretes de água agendados no aparelho', async () => {
    h.register.mockResolvedValue(null);
    const { result } = renderHook(() => useReminders(vi.fn(), user));
    await act(async () => { await result.current[1](); });
    expect(h.schedule).toHaveBeenCalledTimes(1);
    expect(result.current[0]).toBe(true);
  });

  it('permissão negada: não liga nem registra nada', async () => {
    h.perm.mockResolvedValue('denied');
    const { result } = renderHook(() => useReminders(vi.fn(), user));
    await act(async () => { await result.current[1](); });
    expect(result.current[0]).toBe(false);
    expect(h.register).not.toHaveBeenCalled();
  });

  it('desligar: cancela a água local e tira o token do FCM (sem mexer no web push)', async () => {
    localStorage.setItem('reminders_enabled', 'true');
    const { result } = renderHook(() => useReminders(vi.fn(), user));
    await act(async () => { await result.current[1](); });
    expect(result.current[0]).toBe(false);
    expect(h.cancel).toHaveBeenCalled();
    expect(h.unregister).toHaveBeenCalled();
    expect(h.webUnsub).not.toHaveBeenCalled();
  });
});
