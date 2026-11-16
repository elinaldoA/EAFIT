// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';

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
import { getDateForWeekday } from '../lib/utils';
import { enqueue } from '../lib/syncQueue';
import { useWorkout } from './useWorkout';

function wrapper({ children }) {
  return <WorkoutProvider>{children}</WorkoutProvider>;
}

const DAY = { dia: 'Segunda', foco: 'Peito', exercicios: [], pos: [] };

// Resposta "de sucesso" universal: um array vazio com campos extra plicados —
// serve tanto pra chamadas que esperam um objeto (existing.id, w.completed)
// quanto pra exercise_sets (sets.forEach), já que a fake DAY não tem exercícios.
function okFrom() {
  const row = { id: 'w1', workout_date: getDateForWeekday('Segunda'), completed: false, started_at: null, finished_at: null, duration_seconds: null };
  // Array (consulta da semana) com os campos da linha espalhados (maybeSingle/single).
  const data = Object.assign([row], row);
  return chain({ data, error: null });
}

// Sem isso os providers de testes anteriores seguem montados e escutando online/visibilitychange.
afterEach(() => cleanup());

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

  it('sem rede, abre com o último plano salvo em vez de ficar sem treino', async () => {
    await renderReady();
    mockFetchActivePlan.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useWorkout(), { wrapper });
    await waitFor(() => expect(result.current.syncStatus).toBe('error'));
    expect(result.current.activePlanDays).toEqual([DAY]);
    expect(mockToast).toHaveBeenCalledWith('📴 Sem conexão — usando os dados salvos no aparelho');
  });

  it('sem usuário logado, não carrega plano nem chama o backend', async () => {
    mockAuthState.user = null;
    const { result } = renderHook(() => useWorkout(), { wrapper });

    expect(result.current.activePlanDays).toEqual([]);
    expect(mockFetchActivePlan).not.toHaveBeenCalled();
  });
});

describe('WorkoutProvider — fila pendente na abertura e reenvio', () => {
  const SET_KEY = 'set_Supino_1_carga';

  // Servidor "atrasado": responde com a carga antiga até a escrita da fila chegar.
  function serverWith(state) {
    const weekRow = { id: 'w1', workout_date: getDateForWeekday('Segunda'), completed: false, started_at: null, finished_at: null, duration_seconds: null };
    return (table) => {
      if (table === 'exercise_sets') {
        return new Proxy({}, {
          get(_t, prop) {
            // Escrita lenta (rede ruim): o servidor só passa a ter o valor novo depois de um tempo,
            // então uma leitura feita nesse intervalo ainda enxerga o valor antigo.
            if (prop === 'upsert') return (row) => new Promise((resolve) => {
              state.upserts += 1;
              setTimeout(() => { state.carga = row.carga; resolve({ error: null }); }, 40);
            });
            if (prop === 'then') return (res, rej) => Promise.resolve({ data: [{ workout_id: 'w1', exercise_name: 'Supino', set_number: 1, carga: state.carga, completed: false }], error: null }).then(res, rej);
            return () => chain({ data: [{ workout_id: 'w1', exercise_name: 'Supino', set_number: 1, carga: state.carga, completed: false }], error: null });
          },
        });
      }
      return chain({ data: Object.assign([weekRow], weekRow), error: null });
    };
  }

  it('abrir o app com treino feito offline não volta as cargas para as do servidor', async () => {
    const state = { carga: 60, upserts: 0 };
    mockFrom.mockImplementation(serverWith(state));
    // Treinou sem rede: 80 kg no aparelho e na fila; o servidor ainda tem 60.
    localStorage.setItem(SET_KEY, '80');
    localStorage.setItem('pendingSyncQueue', JSON.stringify([
      { id: 'a', type: 'set_state', payload: { workout_id: 'w1', exercise_name: 'Supino', set_number: 1, patch: { carga: 80 } } },
    ]));

    const result = await renderReady();

    expect(state.upserts).toBe(1);
    expect(state.carga).toBe(80);
    expect(localStorage.getItem(SET_KEY)).toBe('80');
    expect(JSON.parse(localStorage.getItem('pendingSyncQueue'))).toEqual([]);
    expect(result.current.workoutIds.Segunda).toBe('w1');
  });

  it('se a fila não esvazia na abertura, o que está no aparelho continua valendo e o status segue pendente', async () => {
    const state = { carga: 60, upserts: 0 };
    const server = serverWith(state);
    mockFrom.mockImplementation((table) => {
      if (table === 'exercise_sets') {
        return new Proxy({}, {
          get(_t, prop) {
            if (prop === 'upsert') return () => chain({ error: { message: 'offline' } });
            return () => chain({ data: [{ workout_id: 'w1', exercise_name: 'Supino', set_number: 1, carga: 60, completed: false }], error: null });
          },
        });
      }
      return server(table);
    });
    localStorage.setItem(SET_KEY, '80');
    localStorage.setItem('pendingSyncQueue', JSON.stringify([
      { id: 'a', type: 'set_state', payload: { workout_id: 'w1', exercise_name: 'Supino', set_number: 1, patch: { carga: 80 } } },
    ]));

    const { result } = renderHook(() => useWorkout(), { wrapper });
    await waitFor(() => expect(result.current.workoutIds.Segunda).toBe('w1'));

    expect(localStorage.getItem(SET_KEY)).toBe('80');
    expect(result.current.syncStatus).toBe('pending');
    expect(JSON.parse(localStorage.getItem('pendingSyncQueue'))).toHaveLength(1);
  });

  it('envio pedido várias vezes ao mesmo tempo roda a fila uma vez só', async () => {
    const state = { carga: 60, upserts: 0 };
    mockFrom.mockImplementation(serverWith(state));
    localStorage.setItem('pendingSyncQueue', JSON.stringify([
      { id: 'a', type: 'set_state', payload: { workout_id: 'w1', exercise_name: 'Supino', set_number: 1, patch: { carga: 80 } } },
    ]));
    const result = await renderReady();
    expect(state.upserts).toBe(1);

    localStorage.setItem('pendingSyncQueue', JSON.stringify([
      { id: 'b', type: 'set_state', payload: { workout_id: 'w1', exercise_name: 'Supino', set_number: 1, patch: { carga: 90 } } },
    ]));
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(state.carga).toBe(90));
    expect(state.upserts).toBe(2);
    expect(result.current.syncStatus).toBe('ok');
  });

  it('voltar para o app com pendências tenta enviar de novo', async () => {
    const state = { carga: 60, upserts: 0 };
    mockFrom.mockImplementation(serverWith(state));
    await renderReady();

    localStorage.setItem('pendingSyncQueue', JSON.stringify([
      { id: 'c', type: 'set_state', payload: { workout_id: 'w1', exercise_name: 'Supino', set_number: 1, patch: { carga: 70 } } },
    ]));
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });

    await waitFor(() => expect(state.carga).toBe(70));
    expect(JSON.parse(localStorage.getItem('pendingSyncQueue'))).toEqual([]);
  });

  it('gravação que falha com a fila parada agenda uma nova tentativa (sinal fraco depois de um envio ok)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const upserts = [];
      let online = false;
      mockFrom.mockImplementation((table) => {
        if (table === 'exercise_sets') {
          return new Proxy({}, {
            get(_t, prop) {
              if (prop === 'upsert') return () => { upserts.push(1); return chain({ error: online ? null : { message: 'offline' } }); };
              return () => chain({ data: [], error: null });
            },
          });
        }
        return okFrom();
      });
      renderHook(() => useWorkout(), { wrapper });
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(upserts).toHaveLength(0); // fila vazia na abertura: nada a enviar

      // Entra uma pendência depois (a gravação falhou): ninguém chamou o envio.
      await act(async () => {
        enqueue('set_state', { workout_id: 'w1', exercise_name: 'Supino', set_number: 1, patch: { carga: 80 } });
        await vi.advanceTimersByTimeAsync(14000);
      });
      expect(upserts).toHaveLength(0);
      online = true;
      await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
      expect(upserts).toHaveLength(1);
      expect(JSON.parse(localStorage.getItem('pendingSyncQueue'))).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('enquanto sobra pendência, tenta de novo sozinho em intervalos que dobram', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const upserts = [];
      let online = false;
      mockFrom.mockImplementation((table) => {
        if (table === 'exercise_sets') {
          return new Proxy({}, {
            get(_t, prop) {
              if (prop === 'upsert') return () => { upserts.push(Date.now()); return chain({ error: online ? null : { message: 'offline' } }); };
              return () => chain({ data: [], error: null });
            },
          });
        }
        return okFrom();
      });
      localStorage.setItem('pendingSyncQueue', JSON.stringify([
        { id: 'a', type: 'set_state', payload: { workout_id: 'w1', exercise_name: 'Supino', set_number: 1, patch: { carga: 80 } } },
      ]));

      renderHook(() => useWorkout(), { wrapper });
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(upserts).toHaveLength(1);          // abertura

      await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
      expect(upserts).toHaveLength(2);          // 15 s depois
      await act(async () => { await vi.advanceTimersByTimeAsync(29000); });
      expect(upserts).toHaveLength(2);          // ainda não: o intervalo dobrou para 30 s
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(upserts).toHaveLength(3);

      online = true;
      await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
      expect(upserts).toHaveLength(4);          // deu certo: para de tentar
      await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60000); });
      expect(upserts).toHaveLength(4);
      expect(JSON.parse(localStorage.getItem('pendingSyncQueue'))).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('WorkoutProvider — envio ao finalizar o treino', () => {
  const setOp = (carga) => ({ id: `op${carga}`, type: 'set_state', payload: { workout_id: 'w1', exercise_name: 'Supino', set_number: 1, patch: { carga } } });

  it('sem nada na fila: não consulta o servidor e devolve null', async () => {
    const result = await renderReady();
    mockFrom.mockClear();
    let out;
    await act(async () => { out = await result.current.syncAfterFinish(); });
    expect(out).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('com pendência e rede: envia agora, sem esperar o intervalo nem o evento de rede', async () => {
    const result = await renderReady();
    // Entra na fila depois da abertura (como a gravação de fim de treino que falhou).
    localStorage.setItem('pendingSyncQueue', JSON.stringify([setOp(80)]));
    let out;
    await act(async () => { out = await result.current.syncAfterFinish(); });
    expect(out).toEqual({ remaining: 0 });
    expect(JSON.parse(localStorage.getItem('pendingSyncQueue'))).toEqual([]);
    expect(mockFrom).toHaveBeenCalledWith('exercise_sets');
  });

  it('sem rede: devolve quantas ficaram e mantém a fila', async () => {
    const result = await renderReady();
    mockFrom.mockImplementation(() => chain({ data: null, error: { message: 'offline' } }));
    localStorage.setItem('pendingSyncQueue', JSON.stringify([setOp(80), { id: 'x', type: 'workout_status', payload: { id: 'w1', completed: true } }]));
    let out;
    await act(async () => { out = await result.current.syncAfterFinish(); });
    expect(out).toEqual({ remaining: 2 });
    expect(JSON.parse(localStorage.getItem('pendingSyncQueue'))).toHaveLength(2);
    expect(result.current.syncStatus).toBe('pending');
  });
});
