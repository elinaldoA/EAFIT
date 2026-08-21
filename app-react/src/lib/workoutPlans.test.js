import { describe, it, expect, vi, beforeEach } from 'vitest';

// workoutPlans.js importa lib/supabase.js (createClient() na hora do import
// falha sem VITE_SUPABASE_URL). Mocka db.from(...) com um query builder falso
// que ecoa de volta o payload de insert/update, pra simular o comportamento
// real do Supabase (select().single() após insert devolve a linha inserida).
const { mockDb } = vi.hoisted(() => ({ mockDb: { from: vi.fn() } }));
vi.mock('./supabase', () => ({ db: mockDb }));
// applyPlanExpiry chama evaluateCycleEvolution só pra decidir o veredito;
// mocka pra controlar o veredito diretamente por teste, sem simular todo o
// histórico de séries/peso/aderência que evaluateCycleEvolution.test.js já cobre.
vi.mock('./planEvolution', () => ({ evaluateCycleEvolution: vi.fn() }));

import { adjustNivelForVerdict, autoGenerateNextCycle, fetchActivePlan } from './workoutPlans';
import { evaluateCycleEvolution } from './planEvolution';
import { TODAY_DATE } from '../data/treinoData';

function chainResolving(resultFactory) {
  const chain = {
    _payload: undefined,
    insert(payload) { chain._payload = payload; return chain; },
    update(payload) { chain._payload = payload; return chain; },
    delete() { return chain; },
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    in: () => chain,
    gte: () => chain,
    not: () => chain,
    limit: () => chain,
    single: () => Promise.resolve(resolve()),
    maybeSingle: () => Promise.resolve(resolve()),
    then: (resolveFn, reject) => Promise.resolve(resolve()).then(resolveFn, reject),
  };
  function resolve() {
    return typeof resultFactory === 'function' ? resultFactory(chain._payload) : resultFactory;
  }
  return chain;
}

function defaultDbMock() {
  mockDb.from.mockImplementation((table) => {
    if (table === 'workout_plans') {
      return chainResolving((payload) => ({ data: payload ? { id: 'new-plan-id', ...payload } : null, error: null }));
    }
    if (table === 'plan_days') {
      return chainResolving((payload) => ({ data: payload ? { id: 'day-id', ...payload } : null, error: null }));
    }
    return chainResolving({ data: null, error: null }); // plan_exercises
  });
}

beforeEach(() => {
  mockDb.from.mockReset();
  defaultDbMock();
});

describe('adjustNivelForVerdict', () => {
  it('sobe um nível no veredito positivo', () => {
    expect(adjustNivelForVerdict('iniciante', 'positivo')).toBe('intermediario');
    expect(adjustNivelForVerdict('intermediario', 'positivo')).toBe('avancado');
  });

  it('não passa do topo (avancado)', () => {
    expect(adjustNivelForVerdict('avancado', 'positivo')).toBe('avancado');
  });

  it('desce um nível no veredito negativo', () => {
    expect(adjustNivelForVerdict('avancado', 'negativo')).toBe('intermediario');
    expect(adjustNivelForVerdict('intermediario', 'negativo')).toBe('iniciante');
  });

  it('não passa do piso (iniciante)', () => {
    expect(adjustNivelForVerdict('iniciante', 'negativo')).toBe('iniciante');
  });

  it('mantém o nível em veredito neutro ou nível desconhecido', () => {
    expect(adjustNivelForVerdict('intermediario', 'neutro')).toBe('intermediario');
    expect(adjustNivelForVerdict('nivel-invalido', 'positivo')).toBe('nivel-invalido');
  });
});

describe('autoGenerateNextCycle', () => {
  const meta = { peso: 80, altura: 178, meta: 'massa', nivel: 'intermediario', weeklyGoal: 5 };
  const plan = { id: 'expired-plan', duration_weeks: 4 };

  it('gera e ativa um novo ciclo quando não há sucessor configurado', async () => {
    const result = await autoGenerateNextCycle('u1', plan, { verdict: 'positivo' }, meta);

    expect(result.switched).toBe(true);
    expect(result.successorName).toContain('Progressão automática');
    expect(result.successorName).toContain(TODAY_DATE);
  });

  it('ajusta a duração do novo ciclo conforme o veredito', async () => {
    let capturedDuration = null;
    mockDb.from.mockImplementation((table) => {
      if (table === 'workout_plans') {
        return chainResolving((payload) => {
          if (payload?.duration_weeks) capturedDuration = payload.duration_weeks;
          return { data: payload ? { id: 'new-plan-id', ...payload } : null, error: null };
        });
      }
      if (table === 'plan_days') {
        return chainResolving((payload) => ({ data: payload ? { id: 'day-id', ...payload } : null, error: null }));
      }
      return chainResolving({ data: null, error: null });
    });

    await autoGenerateNextCycle('u1', plan, { verdict: 'positivo' }, meta);
    expect(capturedDuration).toBe(3); // 4 semanas base - 1 (antecipa o próximo ciclo)

    await autoGenerateNextCycle('u1', plan, { verdict: 'negativo' }, meta);
    expect(capturedDuration).toBe(6); // 4 semanas base + 2 (mais tempo pra consolidar)
  });

  it('não gera plano se o perfil ainda não tem peso/altura', async () => {
    const result = await autoGenerateNextCycle('u1', plan, { verdict: 'positivo' }, { nivel: 'intermediario' });

    expect(result.switched).toBe(false);
    expect(mockDb.from).not.toHaveBeenCalled();
  });
});

describe('fetchActivePlan (fluxo de vencimento do ciclo)', () => {
  const baseMeta = { peso: 80, altura: 178, meta: 'saude', nivel: 'iniciante', weeklyGoal: 3 };

  function isoDate(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  }

  // Enfileira uma resposta por chamada a db.from('workout_plans'), na ordem em
  // que fetchActivePlan/applyPlanExpiry/setActivePlan as disparam. A última
  // entrada se repete se houver mais chamadas do que o previsto.
  function mockWorkoutPlans(factories) {
    let i = 0;
    mockDb.from.mockImplementation((table) => {
      if (table === 'workout_plans') {
        const factory = factories[Math.min(i, factories.length - 1)];
        i += 1;
        return chainResolving(factory);
      }
      if (table === 'plan_days') {
        return chainResolving((payload) => (payload ? { data: { id: 'day-id', ...payload }, error: null } : { data: [], error: null }));
      }
      if (table === 'plan_exercises') {
        return chainResolving((payload) => (payload ? { data: null, error: null } : { data: [], error: null }));
      }
      return chainResolving({ data: null, error: null }); // workout_templates etc.
    });
  }

  const activePlan = (overrides = {}) => ({
    id: 'plan-1', name: 'Atual', created_at: '2024-01-01',
    start_date: isoDate(-25), end_date: isoDate(-4), duration_weeks: 3,
    next_plan_id: null, regression_plan_id: null,
    ...overrides,
  });

  beforeEach(() => {
    evaluateCycleEvolution.mockReset();
  });

  it('mantém o plano ativo quando o ciclo ainda não venceu', async () => {
    mockWorkoutPlans([{ data: [activePlan({ end_date: isoDate(10) })], error: null }]);

    const result = await fetchActivePlan('u1', baseMeta);

    expect(result.id).toBe('plan-1');
    expect(result.expiredNoSuccessor).toBeUndefined();
    expect(result.switchInfo).toBeUndefined();
    expect(evaluateCycleEvolution).not.toHaveBeenCalled();
  });

  it('ativa next_plan_id quando o ciclo vence com veredito positivo', async () => {
    evaluateCycleEvolution.mockResolvedValue({ verdict: 'positivo' });
    mockWorkoutPlans([
      { data: [activePlan({ next_plan_id: 'succ-next', regression_plan_id: 'succ-reg' })], error: null }, // actives
      { data: { id: 'succ-next', name: 'Fase 2', duration_weeks: 4 }, error: null }, // lookup do sucessor
      { data: null, error: null }, // setActivePlan: desativa todos
      { data: null, error: null }, // setActivePlan: ativa succ-next
      { data: [{ id: 'succ-next', name: 'Fase 2', created_at: '2024-01-01', start_date: isoDate(0), end_date: isoDate(21), duration_weeks: 3, next_plan_id: null, regression_plan_id: null }], error: null }, // actives (recursivo)
    ]);

    const result = await fetchActivePlan('u1', baseMeta);

    expect(result.id).toBe('succ-next');
    expect(result.switchInfo).toEqual({ toName: 'Fase 2', verdict: 'positivo' });
  });

  it('ativa regression_plan_id (não next_plan_id) quando o veredito é negativo', async () => {
    evaluateCycleEvolution.mockResolvedValue({ verdict: 'negativo' });
    mockWorkoutPlans([
      { data: [activePlan({ next_plan_id: 'succ-next', regression_plan_id: 'succ-reg' })], error: null },
      { data: { id: 'succ-reg', name: 'Recuperação', duration_weeks: 4 }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: [{ id: 'succ-reg', name: 'Recuperação', created_at: '2024-01-01', start_date: isoDate(0), end_date: isoDate(28), duration_weeks: 6, next_plan_id: null, regression_plan_id: null }], error: null },
    ]);

    const result = await fetchActivePlan('u1', baseMeta);

    expect(result.id).toBe('succ-reg');
    expect(result.switchInfo.verdict).toBe('negativo');
  });

  it('gera um novo ciclo automaticamente quando não há sucessor configurado', async () => {
    evaluateCycleEvolution.mockResolvedValue({ verdict: 'neutro' });
    mockWorkoutPlans([
      { data: [activePlan()], error: null }, // actives
      (payload) => ({ data: payload ? { id: 'gen-1', ...payload } : null, error: null }), // insert do plano gerado
      { data: null, error: null }, // setActivePlan: desativa todos
      { data: null, error: null }, // setActivePlan: ativa gen-1
      { data: [{ id: 'gen-1', name: 'Continuidade automática', created_at: '2024-01-01', start_date: isoDate(0), end_date: isoDate(21), duration_weeks: 3, next_plan_id: null, regression_plan_id: null }], error: null }, // actives (recursivo)
    ]);

    const result = await fetchActivePlan('u1', baseMeta);

    expect(result.id).toBe('gen-1');
    expect(result.switchInfo.toName).toContain('automática');
  });

  it('cai para geração automática se o sucessor configurado foi excluído', async () => {
    evaluateCycleEvolution.mockResolvedValue({ verdict: 'neutro' });
    mockWorkoutPlans([
      { data: [activePlan({ next_plan_id: 'ghost-id' })], error: null }, // actives
      { data: null, error: null }, // lookup do sucessor -> não existe mais
      (payload) => ({ data: payload ? { id: 'gen-2', ...payload } : null, error: null }),
      { data: null, error: null },
      { data: null, error: null },
      { data: [{ id: 'gen-2', name: 'Continuidade automática', created_at: '2024-01-01', start_date: isoDate(0), end_date: isoDate(21), duration_weeks: 3, next_plan_id: null, regression_plan_id: null }], error: null },
    ]);

    const result = await fetchActivePlan('u1', baseMeta);

    expect(result.id).toBe('gen-2');
  });

  it('sinaliza expiredNoSuccessor e não troca nada quando falta peso/altura no perfil', async () => {
    evaluateCycleEvolution.mockResolvedValue({ verdict: 'neutro' });
    mockWorkoutPlans([{ data: [activePlan()], error: null }]);

    const result = await fetchActivePlan('u1', { nivel: 'iniciante' }); // sem peso/altura

    expect(result.expiredNoSuccessor).toBe(true);
    expect(result.id).toBe('plan-1');
    expect(result.switchInfo).toBeUndefined();
  });

  it('mantém o plano ativo mais antigo quando há duplicados', async () => {
    const oldest = activePlan({ id: 'p-old', created_at: '2024-01-01', end_date: isoDate(10) });
    const newer = activePlan({ id: 'p-new', created_at: '2024-02-01', end_date: isoDate(10) });
    mockWorkoutPlans([{ data: [oldest, newer], error: null }]);

    const result = await fetchActivePlan('u1', baseMeta);

    expect(result.id).toBe('p-old');
  });
});
