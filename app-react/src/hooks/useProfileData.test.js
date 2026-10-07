// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup, waitFor, act } from '@testing-library/react';

const h = vi.hoisted(() => ({ workouts: [], error: null, fetchWeightLogs: vi.fn() }));

function chain() {
  const c = {
    select: () => c, eq: () => c, order: () => c,
    then: (resolve, reject) => Promise.resolve({ data: h.error ? null : h.workouts, error: h.error }).then(resolve, reject),
  };
  return c;
}

vi.mock('../lib/supabase', () => ({ db: { from: () => chain() } }));
vi.mock('../lib/weightLog', () => ({ fetchWeightLogs: (...a) => h.fetchWeightLogs(...a) }));
vi.mock('../lib/utils', async (importActual) => ({ ...(await importActual()), getWeekStart: () => '2026-10-05' }));

import { useProfileData } from './useProfileData';

const toast = vi.fn();
const user = { id: 'u1', user_metadata: {} };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T15:00:00Z'));
  toast.mockReset();
  h.error = null;
  h.workouts = [
    { id: 'a', workout_date: '2026-10-07', duration_seconds: 3000 },
    { id: 'b', workout_date: '2026-10-06', duration_seconds: 3000 },
    { id: 'c', workout_date: '2026-10-01', duration_seconds: 3000 },
  ];
  h.fetchWeightLogs.mockReset().mockResolvedValue([{ log_date: '2026-10-01', peso: 80 }]);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useProfileData', () => {
  it('antes de carregar mostra traços; inativo ou sem usuário nem consulta', async () => {
    const { result } = renderHook(() => useProfileData(false, user, toast));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.stats).toEqual({ total: '–', week: '–', streak: '–' });
    expect(h.fetchWeightLogs).not.toHaveBeenCalled();
  });

  it('calcula total, treinos da semana e sequência', async () => {
    const { result } = renderHook(() => useProfileData(true, user, toast));
    await waitFor(() => expect(result.current.stats.total).toBe(3));
    expect(result.current.stats.week).toBe(2);
    expect(result.current.stats.streak).toBe('2d');
    expect(result.current.weightLogs).toEqual([{ log_date: '2026-10-01', peso: 80 }]);
  });

  it('sem treinos mostra sequência 0d', async () => {
    h.workouts = [];
    const { result } = renderHook(() => useProfileData(true, user, toast));
    await waitFor(() => expect(result.current.stats.total).toBe(0));
    expect(result.current.stats.streak).toBe('0d');
  });

  it('erro avisa com toast e mantém os traços', async () => {
    h.error = new Error('rede');
    const { result } = renderHook(() => useProfileData(true, user, toast));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('⚠️ Erro ao carregar estatísticas'));
    expect(result.current.stats.total).toBe('–');
  });

  it('setWeightLogs atualiza o histórico de peso (usado ao registrar um novo)', async () => {
    const { result } = renderHook(() => useProfileData(true, user, toast));
    await waitFor(() => expect(result.current.weightLogs).toHaveLength(1));
    act(() => result.current.setWeightLogs([]));
    expect(result.current.weightLogs).toEqual([]);
  });
});
