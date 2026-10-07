// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({
  requestNotificationPermission: vi.fn(),
  subscribeToPush: vi.fn(),
  unsubscribeFromPush: vi.fn(),
}));

vi.mock('../lib/notifications', () => ({ requestNotificationPermission: (...a) => h.requestNotificationPermission(...a) }));
vi.mock('../lib/pushSubscriptions', () => ({
  subscribeToPush: (...a) => h.subscribeToPush(...a),
  unsubscribeFromPush: (...a) => h.unsubscribeFromPush(...a),
}));

import { useReminders } from './useReminders';

const toast = vi.fn();
const user = { id: 'u1' };

beforeEach(() => {
  localStorage.clear();
  toast.mockReset();
  h.requestNotificationPermission.mockReset().mockResolvedValue('granted');
  h.subscribeToPush.mockReset().mockResolvedValue(undefined);
  h.unsubscribeFromPush.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useReminders', () => {
  it('começa desligado, ou ligado se estava guardado no aparelho', () => {
    expect(renderHook(() => useReminders(toast, user)).result.current[0]).toBe(false);
    localStorage.setItem('reminders_enabled', 'true');
    expect(renderHook(() => useReminders(toast, user)).result.current[0]).toBe(true);
  });

  it('ligar pede permissão, guarda, inscreve no push e avisa', async () => {
    const { result } = renderHook(() => useReminders(toast, user));
    await act(async () => { await result.current[1](); });
    expect(h.subscribeToPush).toHaveBeenCalledWith('u1');
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem('reminders_enabled')).toBe('true');
    expect(toast).toHaveBeenCalledWith('🔔 Lembretes ativados (funcionam mesmo com o app fechado)');
  });

  it('permissão negada não liga nada', async () => {
    h.requestNotificationPermission.mockResolvedValue('denied');
    const { result } = renderHook(() => useReminders(toast, user));
    await act(async () => { await result.current[1](); });
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem('reminders_enabled')).toBeNull();
    expect(h.subscribeToPush).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('⚠️ Permissão de notificação negada');
  });

  it('navegador sem suporte avisa com a mensagem certa', async () => {
    h.requestNotificationPermission.mockResolvedValue('unsupported');
    const { result } = renderHook(() => useReminders(toast, user));
    await act(async () => { await result.current[1](); });
    expect(toast).toHaveBeenCalledWith('⚠️ Notificações não suportadas neste navegador');
  });

  it('push indisponível mantém os lembretes ligados só com o app aberto', async () => {
    h.subscribeToPush.mockRejectedValue(new Error('sem VAPID'));
    const { result } = renderHook(() => useReminders(toast, user));
    await act(async () => { await result.current[1](); });
    expect(result.current[0]).toBe(true);
    expect(toast).toHaveBeenCalledWith('🔔 Lembretes ativados (só com o app aberto — push indisponível)');
  });

  it('sem usuário liga os lembretes locais sem inscrever no push', async () => {
    const { result } = renderHook(() => useReminders(toast, null));
    await act(async () => { await result.current[1](); });
    expect(result.current[0]).toBe(true);
    expect(h.subscribeToPush).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('🔔 Lembretes ativados');
  });

  it('desligar cancela a inscrição do push e guarda', async () => {
    localStorage.setItem('reminders_enabled', 'true');
    const { result } = renderHook(() => useReminders(toast, user));
    await act(async () => { await result.current[1](); });
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem('reminders_enabled')).toBe('false');
    expect(h.unsubscribeFromPush).toHaveBeenCalled();
    expect(h.requestNotificationPermission).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith('🔕 Lembretes desativados');
  });

  it('falha ao cancelar a inscrição não impede de desligar', async () => {
    h.unsubscribeFromPush.mockRejectedValue(new Error('x'));
    localStorage.setItem('reminders_enabled', 'true');
    const { result } = renderHook(() => useReminders(toast, user));
    await act(async () => { await result.current[1](); });
    expect(result.current[0]).toBe(false);
  });
});
