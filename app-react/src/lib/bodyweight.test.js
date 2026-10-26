import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb } = vi.hoisted(() => ({ mockDb: { from: vi.fn() } }));
vi.mock('./supabase', () => ({ db: mockDb }));

import {
  PROGRESSIONS, progressionOf, evaluateProgress, bestMarks, checkForBodyweightPR,
  goalUnit, goalProgress, readBodyweightGoals, groupSessions,
} from './bodyweight';

const set = (date, reps, extra = {}) => ({ date, carga: null, reps, duracaoS: null, ...extra });
const sec = (date, duracaoS) => ({ date, carga: null, reps: null, duracaoS });

describe('progressionOf', () => {
  it('acha o degrau, o anterior e o próximo', () => {
    const p = progressionOf('Flexão de Braço');
    expect(p.chain.id).toBe('empurrar');
    expect(p.level).toBe(4);
    expect(p.total).toBe(7);
    expect(p.prev).toBe('Flexão de Braço com Joelhos Apoiados');
    expect(p.next).toBe('Flexão Declinada (Pés no Banco)');
  });

  it('o último degrau não tem próximo e fora da cadeia devolve null', () => {
    expect(progressionOf('Flexão com Um Braço').next).toBeNull();
    expect(progressionOf('Supino Reto com Barra')).toBeNull();
  });

  it('nenhum exercício aparece em duas cadeias', () => {
    const all = PROGRESSIONS.flatMap(c => c.steps);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('evaluateProgress', () => {
  const EX = { nome: 'Flexão de Braço', series: '3', reps: '8-10' };

  it('pronto quando as duas últimas sessões bateram o teto em todas as séries', () => {
    const sets = [
      set('2026-10-01', 10), set('2026-10-01', 10), set('2026-10-01', 10),
      set('2026-10-08', 10), set('2026-10-08', 11), set('2026-10-08', 10),
    ];
    const r = evaluateProgress(sets, EX);
    expect(r.ready).toBe(true);
    expect(r.unit).toBe('reps');
  });

  it('com uma sessão só ou uma série abaixo do teto não está pronto e sugere +1', () => {
    const one = [set('2026-10-08', 10), set('2026-10-08', 10), set('2026-10-08', 10)];
    expect(evaluateProgress(one, EX).ready).toBe(false);
    const miss = [...one, set('2026-10-01', 10), set('2026-10-01', 9), set('2026-10-01', 10)];
    const r = evaluateProgress(miss, EX);
    expect(r.ready).toBe(false);
    expect(r.lastBest).toBe(10);
    expect(r.tryValue).toBe(10);
  });

  it('sugere uma repetição a mais, até o teto', () => {
    const r = evaluateProgress([set('2026-10-08', 7), set('2026-10-08', 8)], EX);
    expect(r.lastBest).toBe(8);
    expect(r.tryValue).toBe(9);
  });

  it('série a menos que o planejado não conta como sessão batida', () => {
    const sets = [
      set('2026-10-01', 10), set('2026-10-01', 10),
      set('2026-10-08', 10), set('2026-10-08', 10),
    ];
    expect(evaluateProgress(sets, EX).ready).toBe(false);
  });

  it('exercício por tempo usa a duração e a meta em segundos', () => {
    const ex = { nome: 'Prancha Frontal Estática', series: '2', reps: '40s' };
    const sets = [sec('2026-10-01', 40), sec('2026-10-01', 45), sec('2026-10-08', 41), sec('2026-10-08', 40)];
    const r = evaluateProgress(sets, ex);
    expect(r.ready).toBe(true);
    expect(r.unit).toBe('s');
  });

  it('com kg registrado ou sem histórico devolve null', () => {
    expect(evaluateProgress([set('2026-10-08', 10, { carga: 10 })], EX)).toBeNull();
    expect(evaluateProgress([], EX)).toBeNull();
    expect(evaluateProgress([set('2026-10-08', 10)], { nome: 'x', series: '3', reps: 'até a falha' })).toBeNull();
  });
});

describe('bestMarks / groupSessions', () => {
  it('pega a maior repetição e o maior tempo, ignorando séries com kg', () => {
    const sets = [set('a', 8), set('b', 12), set('c', 20, { carga: 5 }), sec('d', 50), sec('e', 35)];
    expect(bestMarks(sets)).toEqual({ reps: 12, seconds: 50 });
    expect(bestMarks([])).toEqual({ reps: null, seconds: null });
  });

  it('agrupa por data, da mais recente para a mais antiga', () => {
    const g = groupSessions([set('2026-10-01', 5), set('2026-10-08', 6), set('2026-10-08', 7)]);
    expect(g.map(s => s.date)).toEqual(['2026-10-08', '2026-10-01']);
    expect(g[0].sets).toHaveLength(2);
  });
});

describe('checkForBodyweightPR', () => {
  function stubSets(rows) {
    const chain = { select: () => chain, eq: () => chain, then: undefined };
    chain.eq = vi.fn(() => chain);
    let calls = 0;
    chain.eq.mockImplementation(() => {
      calls++;
      return calls < 3 ? chain : Promise.resolve({ data: rows, error: null });
    });
    mockDb.from.mockReturnValue(chain);
  }
  const row = (workout_id, set_number, reps, duracao_s = null) => ({
    workout_id, set_number, carga: null, reps, duracao_s, workouts: { user_id: 'u1', workout_date: '2026-10-01' },
  });

  beforeEach(() => mockDb.from.mockReset());

  it('recorde de repetições quando passa da melhor marca anterior', async () => {
    stubSets([row('w1', 1, 8), row('w1', 2, 9)]);
    expect(await checkForBodyweightPR('u1', 'Flexão de Braço', { reps: 11 })).toEqual({ kind: 'reps', value: 11, previous: 9 });
  });

  it('recorde de tempo', async () => {
    stubSets([row('w1', 1, null, 40)]);
    expect(await checkForBodyweightPR('u1', 'Prancha Frontal Estática', { duracaoS: 55 })).toEqual({ kind: 'time', value: 55, previous: 40 });
  });

  it('a primeira vez, o empate e a própria série não são recorde', async () => {
    stubSets([]);
    expect(await checkForBodyweightPR('u1', 'Flexão de Braço', { reps: 10 })).toBeNull();
    stubSets([row('w1', 1, 10)]);
    expect(await checkForBodyweightPR('u1', 'Flexão de Braço', { reps: 10 })).toBeNull();
    stubSets([row('w1', 1, 12)]);
    expect(await checkForBodyweightPR('u1', 'Flexão de Braço', { reps: 12 }, { workoutId: 'w1', setNumber: 1 })).toBeNull();
  });
});

describe('metas', () => {
  it('core usa segundos e o resto, repetições', () => {
    expect(goalUnit('L-Sit')).toBe('s');
    expect(goalUnit('Barra Fixa (peso corporal)')).toBe('reps');
  });

  it('calcula o progresso e quando a meta é batida', () => {
    const goal = { exercise: 'Flexão de Braço', target: 20 };
    expect(goalProgress(goal, [set('a', 5), set('b', 10)])).toEqual({ current: 10, pct: 50, achieved: false });
    expect(goalProgress(goal, [set('a', 22)])).toEqual({ current: 22, pct: 100, achieved: true });
    expect(goalProgress({ exercise: 'L-Sit', target: 15 }, [sec('a', 9)]).pct).toBe(60);
  });

  it('descarta metas tortas do perfil', () => {
    const user = { user_metadata: { bodyweightGoals: [{ id: 'a', exercise: 'Flexão de Braço', target: 10 }, { id: 'b' }, null, { id: 'c', exercise: 'x', target: 0 }] } };
    expect(readBodyweightGoals(user)).toHaveLength(1);
    expect(readBodyweightGoals({})).toEqual([]);
  });
});
