// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  tables: {},
  fail: new Set(),
  gte: vi.fn(),
  countPhotos: vi.fn(),
  fetchWeightLogs: vi.fn(),
  fetchAllDiscomfort: vi.fn(),
  syncAchievements: vi.fn(),
  sendPushToSelf: vi.fn(),
}));

function chain(table) {
  const c = {
    select: () => c, eq: () => c, in: () => c, not: () => c, order: () => c,
    gte: (...a) => { h.gte(table, ...a); return c; },
    then: (resolve, reject) => Promise.resolve(
      h.fail.has(table) ? { data: null, error: new Error('falha ' + table) } : { data: h.tables[table] ?? [], error: null },
    ).then(resolve, reject),
  };
  return c;
}

vi.mock('../lib/supabase', () => ({ db: { from: table => chain(table) } }));
vi.mock('../data/treinoData', () => ({ todayDate: () => '2026-10-07' }));
vi.mock('../lib/progressPhotos', () => ({ countPhotos: (...a) => h.countPhotos(...a) }));
vi.mock('../lib/weightLog', () => ({ fetchWeightLogs: (...a) => h.fetchWeightLogs(...a) }));
vi.mock('../lib/discomfort', () => ({ fetchAllDiscomfort: (...a) => h.fetchAllDiscomfort(...a) }));
vi.mock('../lib/achievements', () => ({ syncAchievements: (...a) => h.syncAchievements(...a) }));
vi.mock('../lib/pushSubscriptions', () => ({ sendPushToSelf: (...a) => h.sendPushToSelf(...a) }));

import { useDashboardData } from './useDashboardData';

const toast = vi.fn();
const user = { id: 'u1', user_metadata: {} };

beforeEach(() => {
  toast.mockReset();
  h.fail.clear();
  h.gte.mockReset();
  h.tables = {
    workouts: [
      { id: 'w1', workout_date: '2026-10-05', completed: true, day_of_week: 'Segunda' },
      { id: 'w2', workout_date: '2026-10-06', completed: true, day_of_week: 'Terça' },
    ],
    exercise_sets: [
      { exercise_name: 'Supino', carga: '80', workout_id: 'w1', reps: 8 },
      { exercise_name: 'Supino', carga: '82.5', workout_id: 'w2', reps: 8 },
      { exercise_name: 'Remada', carga: '60', workout_id: 'w2', reps: 10 },
    ],
  };
  h.countPhotos.mockReset().mockResolvedValue(2);
  h.fetchWeightLogs.mockReset().mockResolvedValue([{ log_date: '2026-10-01', peso: 80 }]);
  h.fetchAllDiscomfort.mockReset().mockResolvedValue([{ exercise_name: 'Supino', severity: 'forte' }]);
  h.syncAchievements.mockReset().mockResolvedValue({ unlockedIds: new Set(['first']), newlyEarned: [] });
  h.sendPushToSelf.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const loaded = result => waitFor(() => {
  expect(result.current.loading).toBe(false);
  expect(result.current.loadingPR).toBe(false);
  expect(result.current.workouts.length).toBeGreaterThan(0);
});

describe('useDashboardData', () => {
  it('não carrega nada com a aba inativa ou sem usuário', async () => {
    const { result } = renderHook(() => useDashboardData(false, user, toast));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.workouts).toEqual([]);

    const noUser = renderHook(() => useDashboardData(true, null, toast));
    await act(async () => { await Promise.resolve(); });
    expect(noUser.result.current.workouts).toEqual([]);
  });

  it('carrega treinos, séries com data, desconfortos, peso e conquistas', async () => {
    const { result } = renderHook(() => useDashboardData(true, user, toast));
    await loaded(result);
    expect(result.current.workouts).toHaveLength(2);
    expect(result.current.logs).toHaveLength(3);
    expect(result.current.logs[0]).toMatchObject({ exercise_name: 'Supino', workout_date: '2026-10-05' });
    expect(result.current.discomfortHistory).toHaveLength(1);
    expect(result.current.weightLogs).toEqual([{ log_date: '2026-10-01', peso: 80 }]);
    expect(result.current.unlockedBadges.has('first')).toBe(true);
  });

  it('a janela dos gráficos é de 60 dias a partir de hoje (fuso de Brasília)', async () => {
    const { result } = renderHook(() => useDashboardData(true, user, toast));
    await loaded(result);
    expect(h.gte).toHaveBeenCalledWith('workouts', 'workout_date', '2026-08-09');
  });

  it('lista os exercícios com carga, sem repetir e em ordem', async () => {
    const { result } = renderHook(() => useDashboardData(true, user, toast));
    await loaded(result);
    expect(result.current.exercises).toEqual(['Remada', 'Supino']);
  });

  it('soma o volume por dia de treino', async () => {
    const { result } = renderHook(() => useDashboardData(true, user, toast));
    await loaded(result);
    expect(result.current.volumePoints.map(p => p.value)).toEqual([80, 142.5]);
  });

  it('sem treinos no período não consulta séries', async () => {
    h.tables.workouts = [];
    const { result } = renderHook(() => useDashboardData(true, user, toast));
    await waitFor(() => expect(h.syncAchievements).toHaveBeenCalled());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.logs).toEqual([]);
    expect(result.current.allTimeLogs).toEqual([]);
  });

  it('conquistas novas avisam com toast e push; a preferência desligada corta só o push', async () => {
    h.syncAchievements.mockResolvedValue({ unlockedIds: new Set(['b1']), newlyEarned: [{ id: 'b1', title: 'Primeiro treino' }] });
    const first = renderHook(() => useDashboardData(true, user, toast));
    await loaded(first.result);
    expect(toast).toHaveBeenCalledWith('🏅 Conquista desbloqueada: Primeiro treino');
    expect(h.sendPushToSelf).toHaveBeenCalledWith({ title: '🏅 Conquista desbloqueada!', body: 'Primeiro treino', tag: 'badge-b1' });

    h.sendPushToSelf.mockClear();
    const muted = { id: 'u1', user_metadata: { notifyRecords: false } };
    const second = renderHook(() => useDashboardData(true, muted, toast));
    await loaded(second.result);
    expect(h.sendPushToSelf).not.toHaveBeenCalled();
  });

  it('a sequência usada nas conquistas vem dos treinos concluídos', async () => {
    const { result } = renderHook(() => useDashboardData(true, user, toast));
    await loaded(result);
    expect(h.syncAchievements).toHaveBeenCalledWith('u1', expect.objectContaining({
      totalTreinos: 2, totalPhotos: 2, totalWeightLogs: 1,
    }));
  });

  it('erro ao carregar a evolução avisa com toast', async () => {
    h.fail.add('workouts');
    renderHook(() => useDashboardData(true, user, toast));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('⚠️ Erro ao carregar evolução'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('⚠️ Erro ao carregar recordes e conquistas'));
  });

  it('o histórico completo só é buscado uma vez por sessão; atualizar manual busca de novo', async () => {
    const { result, rerender } = renderHook(({ active }) => useDashboardData(active, user, toast), { initialProps: { active: true } });
    await loaded(result);
    expect(h.syncAchievements).toHaveBeenCalledTimes(1);

    rerender({ active: false });
    rerender({ active: true });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(h.syncAchievements).toHaveBeenCalledTimes(1);

    await act(async () => { result.current.handleRefreshRecords(); });
    await waitFor(() => expect(h.syncAchievements).toHaveBeenCalledTimes(2));
  });
});
