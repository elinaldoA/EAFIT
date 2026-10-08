import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock('../lib/supabase', () => ({
  db: { rpc: mockRpc },
}));

import { fetchDashboardStats, fetchSignupsByDay, fetchFunnel, fetchRetentionCohorts, fetchVisitSources, fetchVisitOs } from '../lib/dashboardStats';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchDashboardStats', () => {
  it('chama admin_dashboard_stats e retorna a primeira linha', async () => {
    mockRpc.mockResolvedValue({ data: [{ total_users: 3 }], error: null });
    const result = await fetchDashboardStats();
    expect(mockRpc).toHaveBeenCalledWith('admin_dashboard_stats');
    expect(result).toEqual({ total_users: 3 });
  });

  it('retorna null quando não há linha', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    expect(await fetchDashboardStats()).toBeNull();
  });

  it('propaga erro', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not_authorized' } });
    await expect(fetchDashboardStats()).rejects.toMatchObject({ message: 'not_authorized' });
  });
});

describe('fetchSignupsByDay', () => {
  it('chama admin_signups_by_day com o número de dias', async () => {
    mockRpc.mockResolvedValue({ data: [{ day: '2026-07-01', count: 2 }], error: null });
    const result = await fetchSignupsByDay(7);
    expect(mockRpc).toHaveBeenCalledWith('admin_signups_by_day', { days_back: 7 });
    expect(result).toEqual([{ day: '2026-07-01', count: 2 }]);
  });

  it('retorna array vazio quando data vem null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await fetchSignupsByDay()).toEqual([]);
  });
});

describe('fetchFunnel', () => {
  it('chama admin_funnel com o período e retorna a primeira linha', async () => {
    mockRpc.mockResolvedValue({ data: [{ signed_up: 10 }], error: null });
    expect(await fetchFunnel(90)).toEqual({ signed_up: 10 });
    expect(mockRpc).toHaveBeenCalledWith('admin_funnel', { days_back: 90 });
  });

  it('propaga erro', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not_authorized' } });
    await expect(fetchFunnel()).rejects.toMatchObject({ message: 'not_authorized' });
  });
});

describe('fetchRetentionCohorts', () => {
  it('chama admin_retention_cohorts com o número de semanas', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await fetchRetentionCohorts(8)).toEqual([]);
    expect(mockRpc).toHaveBeenCalledWith('admin_retention_cohorts', { weeks: 8 });
  });
});

describe('fetchVisitOs', () => {
  it('chama admin_visit_os com o período', async () => {
    mockRpc.mockResolvedValue({ data: [{ page: 'landing', os: 'android', visits: 2 }], error: null });
    expect(await fetchVisitOs(7)).toEqual([{ page: 'landing', os: 'android', visits: 2 }]);
    expect(mockRpc).toHaveBeenCalledWith('admin_visit_os', { days_back: 7 });
  });
});

describe('fetchVisitSources', () => {
  it('chama admin_visit_sources com o período', async () => {
    mockRpc.mockResolvedValue({ data: [{ page: 'landing', source: 'card', visits: 2 }], error: null });
    expect(await fetchVisitSources(7)).toEqual([{ page: 'landing', source: 'card', visits: 2 }]);
    expect(mockRpc).toHaveBeenCalledWith('admin_visit_sources', { days_back: 7 });
  });
});
