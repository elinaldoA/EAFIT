import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc, mockFrom } = vi.hoisted(() => ({ mockRpc: vi.fn(), mockFrom: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: mockRpc, from: mockFrom } }));

import {
  pct, formatMl, scoreLevel, splitCardio, buildAchievements,
  fetchWellbeingOverview, fetchWellbeingByDay, fetchLowCheckinUsers, fetchCardio, fetchRecordStats, fetchUserWellbeing,
} from './insights';

beforeEach(() => vi.clearAllMocks());

describe('pct', () => {
  it('percentual inteiro; sem base devolve null', () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(0, 10)).toBe(0);
    expect(pct(5, 0)).toBeNull();
    expect(pct(5, null)).toBeNull();
  });
});

describe('formatMl', () => {
  it('mostra em litros com vírgula', () => {
    expect(formatMl(2450)).toBe('2,5 L');
    expect(formatMl(0)).toBe('0,0 L');
    expect(formatMl(null)).toBe('—');
  });
});

describe('scoreLevel', () => {
  it('baixa até 2, boa a partir de 4, média no meio', () => {
    expect(scoreLevel(1.5)).toBe('low');
    expect(scoreLevel(2)).toBe('low');
    expect(scoreLevel(3)).toBe('mid');
    expect(scoreLevel(4)).toBe('high');
    expect(scoreLevel(null)).toBe('none');
  });
});

describe('splitCardio', () => {
  it('separa o total das atividades', () => {
    const out = splitCardio([
      { cs_exercise: '__total__', cs_sessions: '9', cs_users: '4', cs_minutes: '300', cs_km: '42.5' },
      { cs_exercise: 'Esteira', cs_sessions: '6', cs_users: '3', cs_minutes: '200', cs_km: '30' },
    ]);
    expect(out.total).toEqual({ exercise: '__total__', sessions: 9, users: 4, minutes: 300, km: 42.5 });
    expect(out.exercises).toEqual([{ exercise: 'Esteira', sessions: 6, users: 3, minutes: 200, km: 30 }]);
  });

  it('sem linhas, total zerado', () => {
    expect(splitCardio([])).toEqual({ total: { sessions: 0, users: 0, minutes: 0, km: 0 }, exercises: [] });
    expect(splitCardio(null).exercises).toEqual([]);
  });
});

describe('buildAchievements', () => {
  const labels = { a: 'Conquista A', b: 'Conquista B', c: 'Conquista C' };

  it('inclui com zero as que ninguém desbloqueou e ordena da mais comum para a mais rara', () => {
    const out = buildAchievements([
      { as_badge: '__users__', as_users: '10', as_last: null },
      { as_badge: 'b', as_users: '5', as_last: 't2' },
      { as_badge: 'a', as_users: '1', as_last: 't1' },
    ], labels);
    expect(out.base).toBe(10);
    expect(out.list.map(a => [a.id, a.users, a.pct])).toEqual([['b', 5, 50], ['a', 1, 10], ['c', 0, 0]]);
  });

  it('conquista que o painel ainda não conhece aparece pelo id', () => {
    const out = buildAchievements([{ as_badge: 'nova', as_users: 2, as_last: null }], labels);
    expect(out.list[0]).toMatchObject({ id: 'nova', label: 'nova', users: 2, pct: null });
  });
});

describe('chamadas', () => {
  it('fetchWellbeingOverview mantém médias nulas e converte contagens', async () => {
    mockRpc.mockResolvedValue({
      data: [{
        wo_users: '20', wo_checkin_users: '0', wo_checkins: '0', wo_energy: null, wo_sleep: null, wo_mood: null,
        wo_low_users: '0', wo_measure_users: '2', wo_measures: '3', wo_water_users: '5', wo_water_days: '40',
        wo_water_avg_ml: '2100', wo_water_hit_days: '10',
      }],
      error: null,
    });
    const o = await fetchWellbeingOverview(14);
    expect(mockRpc).toHaveBeenCalledWith('admin_wellbeing_overview', { days_back: 14 });
    expect(o).toMatchObject({ users: 20, checkinUsers: 0, energy: null, waterAvgMl: 2100, waterHitDays: 10, measureUsers: 2 });
  });

  it('fetchWellbeingOverview devolve null sem linha', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    expect(await fetchWellbeingOverview()).toBeNull();
  });

  it('fetchWellbeingByDay, fetchLowCheckinUsers, fetchCardio e fetchRecordStats', async () => {
    mockRpc.mockResolvedValueOnce({ data: [{ wd_day: '2026-10-07', wd_checkins: '3', wd_energy: '3.3', wd_sleep: '4', wd_mood: null, wd_water_users: '2', wd_water_avg_ml: '1800', wd_water_hits: '1' }], error: null });
    expect(await fetchWellbeingByDay(7)).toEqual([{ day: '2026-10-07', checkins: 3, energy: 3.3, sleep: 4, mood: null, waterUsers: 2, waterAvgMl: 1800, waterHits: 1 }]);

    mockRpc.mockResolvedValueOnce({ data: [{ lc_user: 'u1', lc_email: 'a@x.com', lc_name: 'Ana', lc_checkins: '5', lc_energy: '1.8', lc_sleep: '2.5', lc_mood: '3', lc_last: '2026-10-07' }], error: null });
    expect(await fetchLowCheckinUsers(30)).toEqual([{ userId: 'u1', email: 'a@x.com', name: 'Ana', checkins: 5, energy: 1.8, sleep: 2.5, mood: 3, last: '2026-10-07' }]);
    expect(mockRpc).toHaveBeenLastCalledWith('admin_low_checkin_users', { days_back: 30, max_rows: 50 });

    mockRpc.mockResolvedValueOnce({ data: [], error: null });
    expect((await fetchCardio(30)).total.sessions).toBe(0);

    mockRpc.mockResolvedValueOnce({ data: [{ rs_exercise: 'Supino', rs_users: '4', rs_top: '120', rs_avg_best: '82.5', rs_sets: '90' }], error: null });
    expect(await fetchRecordStats(90)).toEqual([{ exercise: 'Supino', users: 4, top: 120, avgBest: 82.5, sets: 90 }]);
    expect(mockRpc).toHaveBeenLastCalledWith('admin_record_stats', { days_back: 90, max_rows: 15 });
  });

  it('propaga erro da RPC', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('not_authorized') });
    await expect(fetchCardio()).rejects.toThrow('not_authorized');
  });

  function chain(result) {
    return { select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve(result) }) }) }) };
  }

  it('fetchUserWellbeing lê check-ins e medidas do usuário', async () => {
    mockFrom.mockImplementation(table => chain({ data: [{ id: table }], error: null }));
    expect(await fetchUserWellbeing('u1')).toEqual({ checkins: [{ id: 'daily_checkins' }], measures: [{ id: 'body_measurements' }] });
  });

  it('fetchUserWellbeing falha se uma das leituras falhar', async () => {
    mockFrom.mockImplementation(table => chain(table === 'body_measurements' ? { data: null, error: new Error('rls') } : { data: [], error: null }));
    await expect(fetchUserWellbeing('u1')).rejects.toThrow('rls');
  });
});
