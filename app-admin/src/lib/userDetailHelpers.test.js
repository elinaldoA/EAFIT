import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInvoke, mockRpc } = vi.hoisted(() => ({ mockInvoke: vi.fn(), mockRpc: vi.fn() }));

vi.mock('./supabase', () => ({ db: { functions: { invoke: mockInvoke }, rpc: mockRpc } }));

import {
  formatDate, estimateOneRepMax, computePersonalRecords, callAdminAction, callGeneratePlan,
  METAS, NIVEIS, BADGE_LABELS, SEVERITY_BADGE, SEVERITY_LABEL,
} from './userDetailHelpers';
import { fetchUsersPage, PAGE_SIZE } from './users';

beforeEach(() => vi.clearAllMocks());

describe('constantes', () => {
  it('toda severidade tem badge e rótulo', () => {
    expect(Object.keys(SEVERITY_BADGE).sort()).toEqual(Object.keys(SEVERITY_LABEL).sort());
  });

  it('expõe metas, níveis e rótulos de conquistas', () => {
    expect(METAS).toContain('massa');
    expect(NIVEIS).toEqual(['iniciante', 'intermediario', 'avancado']);
    expect(BADGE_LABELS.streak_7).toMatch(/7 dias/);
  });
});

describe('formatDate', () => {
  it('devolve travessão para valor vazio', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('')).toBe('—');
  });

  it('formata data válida em pt-BR', () => {
    expect(formatDate('2026-03-05T12:00:00Z')).toMatch(/05\/03\/2026/);
  });
});

describe('estimateOneRepMax', () => {
  it('usa Epley', () => {
    expect(estimateOneRepMax(100, 10)).toBeCloseTo(133.33, 1);
  });

  it('1 repetição devolve a própria carga', () => {
    expect(estimateOneRepMax('80', 1)).toBe(80);
  });

  it('aceita strings numéricas', () => {
    expect(estimateOneRepMax('60', '3')).toBeCloseTo(66, 5);
  });

  it('devolve null para entradas inválidas', () => {
    expect(estimateOneRepMax('abc', 5)).toBeNull();
    expect(estimateOneRepMax(50, 0)).toBeNull();
    expect(estimateOneRepMax(50, '')).toBeNull();
  });
});

describe('computePersonalRecords', () => {
  it('fica com a maior carga por exercício, ordenado por carga', () => {
    const out = computePersonalRecords([
      { exercise_name: 'Supino', carga: '60', reps: 10 },
      { exercise_name: 'Supino', carga: '80', reps: 5 },
      { exercise_name: 'Agachamento', carga: '100', reps: 5 },
    ]);
    expect(out.map(r => r.exercise_name)).toEqual(['Agachamento', 'Supino']);
    expect(out[1].carga).toBe(80);
  });

  it('mantém o melhor 1RM mesmo que venha de uma série mais leve', () => {
    const out = computePersonalRecords([
      { exercise_name: 'Remada', carga: '80', reps: 1 },
      { exercise_name: 'Remada', carga: '70', reps: 12 },
    ]);
    expect(out[0].carga).toBe(80);
    expect(out[0].oneRm).toBeCloseTo(98, 5);
  });

  it('ignora séries sem carga numérica', () => {
    expect(computePersonalRecords([{ exercise_name: 'Prancha', carga: '', reps: 1 }])).toEqual([]);
  });

  it('limita a 12 exercícios', () => {
    const sets = Array.from({ length: 20 }, (_, i) => ({ exercise_name: `E${i}`, carga: String(i + 1), reps: 5 }));
    const out = computePersonalRecords(sets);
    expect(out).toHaveLength(12);
    expect(out[0].exercise_name).toBe('E19');
  });
});

describe('callAdminAction', () => {
  it('invoca admin-users com ação, alvo e extras', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    expect(await callAdminAction('ban', 'u1', { reason: 'x' })).toEqual({ ok: true });
    expect(mockInvoke).toHaveBeenCalledWith('admin-users', { body: { action: 'ban', targetUserId: 'u1', reason: 'x' } });
  });

  it('propaga erro do invoke', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('boom') });
    await expect(callAdminAction('ban', 'u1')).rejects.toThrow('boom');
  });

  it('lança o erro devolvido no corpo', async () => {
    mockInvoke.mockResolvedValue({ data: { error: 'forbidden' }, error: null });
    await expect(callAdminAction('ban', 'u1')).rejects.toThrow('forbidden');
  });
});

describe('callGeneratePlan', () => {
  it('invoca admin-generate-plan', async () => {
    mockInvoke.mockResolvedValue({ data: { plan: 1 }, error: null });
    expect(await callGeneratePlan('u9')).toEqual({ plan: 1 });
    expect(mockInvoke).toHaveBeenCalledWith('admin-generate-plan', { body: { kind: 'workout', targetUserId: 'u9' } });
  });

  it('lança o erro do corpo', async () => {
    mockInvoke.mockResolvedValue({ data: { error: 'sem_dados' }, error: null });
    await expect(callGeneratePlan('u9')).rejects.toThrow('sem_dados');
  });
});

describe('fetchUsersPage', () => {
  it('manda filtros vazios como null e calcula o offset', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'a', total_count: 120 }], error: null });
    const out = await fetchUsersPage({ page: 2 });
    expect(mockRpc).toHaveBeenCalledWith('admin_list_users_page', {
      search: null, status_filter: null, page_size: PAGE_SIZE, page_offset: 2 * PAGE_SIZE,
      sort_by: 'created_desc', nivel_filter: null, meta_filter: null,
    });
    expect(out).toEqual({ rows: [{ id: 'a', total_count: 120 }], total: 120 });
  });

  it('repassa os filtros informados', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const out = await fetchUsersPage({ search: 'ana', status: 'active', sort: 'name', nivel: 'iniciante', meta: 'massa', pageSize: 10 });
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ search: 'ana', status_filter: 'active', sort_by: 'name', nivel_filter: 'iniciante', meta_filter: 'massa', page_size: 10 });
    expect(out).toEqual({ rows: [], total: 0 });
  });

  it('propaga erro', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not_authorized' } });
    await expect(fetchUsersPage()).rejects.toMatchObject({ message: 'not_authorized' });
  });
});
