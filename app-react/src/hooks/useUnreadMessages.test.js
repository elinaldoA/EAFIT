// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({ fetchMyMessages: vi.fn() }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/trainerMessages', async (importActual) => ({
  ...(await importActual()),
  fetchMyMessages: (...a) => h.fetchMyMessages(...a),
}));

import { useUnreadMessages } from './useUnreadMessages';
import { MESSAGES_READ_EVENT } from '../lib/trainerMessages';

const rows = [{ read: false }, { read: true }, { read: false }];
const flush = () => act(async () => { await Promise.resolve(); });

beforeEach(() => {
  vi.useFakeTimers();
  h.fetchMyMessages.mockReset().mockResolvedValue(rows);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useUnreadMessages', () => {
  it('conta os recados não lidos ao abrir', async () => {
    const { result } = renderHook(() => useUnreadMessages('u1'));
    await flush();
    expect(result.current).toBe(2);
    expect(h.fetchMyMessages).toHaveBeenCalledWith(20);
  });

  it('sem usuário fica em zero e não consulta', async () => {
    const { result } = renderHook(() => useUnreadMessages(null));
    await flush();
    expect(result.current).toBe(0);
    expect(h.fetchMyMessages).not.toHaveBeenCalled();
  });

  it('falha (sem personal, offline) conta como zero, sem erro', async () => {
    h.fetchMyMessages.mockRejectedValue(new Error('rede'));
    const { result } = renderHook(() => useUnreadMessages('u1'));
    await flush();
    expect(result.current).toBe(0);
  });

  it('atualiza a cada 2 minutos', async () => {
    renderHook(() => useUnreadMessages('u1'));
    await flush();
    h.fetchMyMessages.mockClear();
    await act(async () => { vi.advanceTimersByTime(120_000); });
    expect(h.fetchMyMessages).toHaveBeenCalledTimes(1);
  });

  it('atualiza ao voltar para o app (aba visível)', async () => {
    renderHook(() => useUnreadMessages('u1'));
    await flush();
    h.fetchMyMessages.mockClear();
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(h.fetchMyMessages).toHaveBeenCalledTimes(1);
  });

  it('zera na hora quando o aluno marca como lido', async () => {
    const { result } = renderHook(() => useUnreadMessages('u1'));
    await flush();
    expect(result.current).toBe(2);
    act(() => { window.dispatchEvent(new Event(MESSAGES_READ_EVENT)); });
    expect(result.current).toBe(0);
  });

  it('ao desmontar para de atualizar', async () => {
    const { unmount } = renderHook(() => useUnreadMessages('u1'));
    await flush();
    unmount();
    h.fetchMyMessages.mockClear();
    await act(async () => { vi.advanceTimersByTime(300_000); });
    expect(h.fetchMyMessages).not.toHaveBeenCalled();
  });
});
