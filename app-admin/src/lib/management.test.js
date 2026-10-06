import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));

vi.mock('./supabase', () => ({ db: { rpc: mockRpc } }));

import {
  fetchKpis, fetchActivityByDay, fetchAtRiskUsers, fetchExpiringPlans, fetchTopExercises,
  pctChange, stickiness, displayName, groupDistribution,
} from './management';

beforeEach(() => vi.clearAllMocks());

describe('fetchers', () => {
  it('fetchKpis devolve a primeira linha', async () => {
    mockRpc.mockResolvedValue({ data: [{ total_users: 5 }], error: null });
    expect(await fetchKpis(7)).toEqual({ total_users: 5 });
    expect(mockRpc).toHaveBeenCalledWith('admin_kpis', { days_back: 7 });
  });

  it('fetchKpis devolve null sem linha', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    expect(await fetchKpis()).toBeNull();
  });

  it('passa os argumentos certos para cada RPC', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await fetchActivityByDay(14);
    await fetchAtRiskUsers(21, 50);
    await fetchExpiringPlans(3);
    await fetchTopExercises(90, 5);
    expect(mockRpc.mock.calls).toEqual([
      ['admin_activity_by_day', { days_back: 14 }],
      ['admin_at_risk_users', { inactive_days: 21, max_rows: 50 }],
      ['admin_expiring_plans', { days_ahead: 3 }],
      ['admin_top_exercises', { days_back: 90, max_rows: 5 }],
    ]);
  });

  it('propaga erro', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not_authorized' } });
    await expect(fetchAtRiskUsers()).rejects.toMatchObject({ message: 'not_authorized' });
  });
});

describe('pctChange', () => {
  it('calcula variação percentual', () => {
    expect(pctChange(15, 10)).toBe(50);
    expect(pctChange(5, 10)).toBe(-50);
    expect(pctChange(10, 10)).toBe(0);
  });

  it('aceita números vindos como string (bigint/numeric)', () => {
    expect(pctChange('20', '10')).toBe(100);
  });

  it('retorna null sem base anterior', () => {
    expect(pctChange(5, 0)).toBeNull();
    expect(pctChange(5, null)).toBeNull();
    expect(pctChange(null, 5)).toBeNull();
  });
});

describe('stickiness', () => {
  it('calcula percentual sobre o MAU', () => {
    expect(stickiness(3, 12)).toBe(25);
  });

  it('retorna null com MAU zerado', () => {
    expect(stickiness(0, 0)).toBeNull();
  });
});

describe('displayName', () => {
  it('prefere apelido, depois nome completo, depois e-mail', () => {
    expect(displayName({ apelido: 'Duda', nome: 'Maria', email: 'a@b.com' })).toBe('Duda');
    expect(displayName({ nome: 'Maria', sobrenome: 'Silva', email: 'a@b.com' })).toBe('Maria Silva');
    expect(displayName({ email: 'joao@x.com' })).toBe('joao');
    expect(displayName({})).toBe('—');
  });
});

describe('groupDistribution', () => {
  it('agrupa por dimensão com percentual e ordena por total', () => {
    const out = groupDistribution([
      { dimension: 'meta', value: 'massa', total: '1' },
      { dimension: 'meta', value: 'forca', total: '3' },
      { dimension: 'nivel', value: 'iniciante', total: '2' },
    ]);
    expect(out.meta.map(r => r.value)).toEqual(['forca', 'massa']);
    expect(out.meta.map(r => r.pct)).toEqual([75, 25]);
    expect(out.nivel).toEqual([{ value: 'iniciante', total: 2, pct: 100 }]);
  });
});
