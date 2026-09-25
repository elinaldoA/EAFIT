// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const { mockFrom, mockAuthState, mockToast, mockFetchActivePlan } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockAuthState: { user: { id: 'u1', user_metadata: {} } },
  mockToast: vi.fn(),
  mockFetchActivePlan: vi.fn(),
}));

// Encadeamento genérico ao estilo do query builder do supabase-js — cada
// método (.select/.eq/.single/.update/...) devolve o mesmo objeto, que resolve
// pro `result` configurado assim que awaitado em qualquer ponto da cadeia.
function chain(result) {
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') return Promise.resolve(result).then.bind(Promise.resolve(result));
      if (prop === 'catch') return Promise.resolve(result).catch.bind(Promise.resolve(result));
      return () => chain(result);
    },
  });
}

vi.mock('../lib/supabase', () => ({ db: { from: mockFrom } }));
vi.mock('../lib/workoutPlans', () => ({ fetchActivePlan: mockFetchActivePlan }));
vi.mock('./useAuth', () => ({ useAuth: () => mockAuthState }));
vi.mock('./useToast', () => ({ useToast: () => mockToast }));

import { WorkoutProvider } from './WorkoutContext';
import { useWorkout } from './useWorkout';

function wrapper({ children }) {
  return <WorkoutProvider>{children}</WorkoutProvider>;
}

const DAY = { dia: 'Segunda', foco: 'Peito', exercicios: [], pos: [] };

// Resposta "de sucesso" universal: um array vazio com campos extra plicados —
// serve tanto pra chamadas que esperam um objeto (existing.id, w.completed)
// quanto pra exercise_sets (sets.forEach), já que a fake DAY não tem exercícios.
function okFrom() {
  const data = Object.assign([], { id: 'w1', completed: false, started_at: null, finished_at: null, duration_seconds: null });
  return chain({ data, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockAuthState.user = { id: 'u1', user_metadata: {} };
  mockFetchActivePlan.mockResolvedValue({ id: 'p1', name: 'Plano', days: [DAY] });
  mockFrom.mockImplementation(okFrom);
});

async function renderReady() {
  const { result } = renderHook(() => useWorkout(), { wrapper });
  await waitFor(() => expect(result.current.syncStatus).toBe('ok'));
  return result;
}

describe('WorkoutProvider — sincronização offline', () => {
  it('carrega o plano ativo e fica com syncStatus="ok"', async () => {
    const result = await renderReady();
    expect(result.current.activePlanDays).toEqual([DAY]);
    expect(result.current.workoutIds.Segunda).toBe('w1');
  });

  it('saveWorkoutStatus: falha de rede enfileira a operação e marca syncStatus="pending"', async () => {
    const result = await renderReady();

    // A partir daqui, qualquer chamada a db.from(...) (o update de status) falha.
    mockFrom.mockImplementation(() => chain({ data: null, error: { message: 'offline' } }));

    await act(async () => {
      await result.current.saveWorkoutStatus('Segunda', true);
    });

    expect(result.current.syncStatus).toBe('pending');
    // O item enfileirado carrega o wId já resolvido (veio do load anterior),
    // não o fallback "by_day" — reflete que o app só perdeu a escrita, não o contexto do treino.
    const raw = JSON.parse(localStorage.getItem('pendingSyncQueue'));
    expect(raw).toHaveLength(1);
    expect(raw[0]).toMatchObject({ type: 'workout_status', payload: { id: 'w1', completed: true } });
  });

  it('syncNow: volta a ficar "ok" e some da fila quando a rede volta', async () => {
    const result = await renderReady();

    mockFrom.mockImplementation(() => chain({ data: null, error: { message: 'offline' } }));
    await act(async () => {
      await result.current.saveWorkoutStatus('Segunda', true);
    });
    expect(result.current.syncStatus).toBe('pending');

    // Rede volta: tanto o retry da fila quanto o reload subsequente têm sucesso.
    mockFrom.mockImplementation(okFrom);
    await act(async () => {
      await result.current.syncNow();
    });

    expect(result.current.syncStatus).toBe('ok');
    expect(mockToast).toHaveBeenCalledWith('✅ Dados sincronizados');
    expect(JSON.parse(localStorage.getItem('pendingSyncQueue'))).toEqual([]);
  });

  it('sem usuário logado, não carrega plano nem chama o backend', async () => {
    mockAuthState.user = null;
    const { result } = renderHook(() => useWorkout(), { wrapper });

    expect(result.current.activePlanDays).toEqual([]);
    expect(mockFetchActivePlan).not.toHaveBeenCalled();
  });
});
