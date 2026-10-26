import { describe, it, expect, vi, beforeEach } from 'vitest';

// workoutPlans.js importa lib/supabase.js (createClient() na hora do import
// falha sem VITE_SUPABASE_URL). Mocka db.from(...) com um query builder falso
// que ecoa de volta o payload de insert/update, pra simular o comportamento
// real do Supabase (select().single() após insert devolve a linha inserida).
// db.rpc simula create_workout_plan (devolve o plano criado) e
// activate_workout_plan (sem retorno) — ver defaultRpcMock.
const { mockDb } = vi.hoisted(() => ({ mockDb: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('./supabase', () => ({ db: mockDb }));
// applyPlanExpiry chama evaluateCycleEvolution só pra decidir o veredito;
// mocka pra controlar o veredito diretamente por teste, sem simular todo o
// histórico de séries/peso/aderência que evaluateCycleEvolution.test.js já cobre.
vi.mock('./planEvolution', () => ({ evaluateCycleEvolution: vi.fn() }));

import { adjustNivelForVerdict, autoGenerateNextCycle, fetchActivePlan, createGeneratedPlan, createRunningProgram, setActivePlan, isMissingRpc } from './workoutPlans';
import { evaluateCycleEvolution } from './planEvolution';
import { todayDate } from '../data/treinoData';

function chainResolving(resultFactory) {
  const chain = {
    _payload: undefined,
    insert(payload) { chain._payload = payload; return chain; },
    update(payload) { chain._payload = payload; return chain; },
    delete() { return chain; },
    select: (cols) => { chain._cols = cols; return chain; },
    eq: () => chain,
    neq: () => chain,
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

function defaultRpcMock(planId = 'new-plan-id') {
  mockDb.rpc.mockImplementation((fn, args) => {
    if (fn === 'create_workout_plan') {
      return Promise.resolve({
        data: { id: planId, name: args.p_name, is_active: args.p_activate, duration_weeks: args.p_duration_weeks },
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  });
}

beforeEach(() => {
  mockDb.from.mockReset();
  mockDb.rpc.mockReset();
  defaultDbMock();
  defaultRpcMock();
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
    expect(result.successorName).toContain(todayDate());
  });

  it('cria e ativa o novo ciclo numa chamada só (RPC transacional)', async () => {
    await autoGenerateNextCycle('u1', plan, { verdict: 'neutro' }, meta);

    const createCalls = mockDb.rpc.mock.calls.filter(([fn]) => fn === 'create_workout_plan');
    expect(createCalls).toHaveLength(1);
    const args = createCalls[0][1];
    expect(args.p_user_id).toBe('u1');
    expect(args.p_activate).toBe(true);
    expect(args.p_start_date).toBe(todayDate());
    expect(args.p_days).toHaveLength(7);
  });

  it('ajusta a duração do novo ciclo conforme o veredito', async () => {
    let capturedDuration = null;
    mockDb.rpc.mockImplementation((fn, args) => {
      if (fn === 'create_workout_plan') capturedDuration = args.p_duration_weeks;
      return Promise.resolve({ data: { id: 'new-plan-id', name: args.p_name }, error: null });
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
    expect(mockDb.rpc).not.toHaveBeenCalled();
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
        // A consulta de created_by (plano do personal) não entra na fila:
        // responde "sem personal" e deixa as demais na ordem prevista.
        const chain = chainResolving((payload) => {
          if (chain._cols === 'created_by') return { data: null, error: null };
          const factory = factories[Math.min(i, factories.length - 1)];
          i += 1;
          return typeof factory === 'function' ? factory(payload) : factory;
        });
        return chain;
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
      { data: [{ id: 'succ-next', name: 'Fase 2', created_at: '2024-01-01', start_date: isoDate(0), end_date: isoDate(21), duration_weeks: 3, next_plan_id: null, regression_plan_id: null }], error: null }, // actives (recursivo)
    ]);

    const result = await fetchActivePlan('u1', baseMeta);

    expect(result.id).toBe('succ-next');
    expect(result.switchInfo).toEqual({ toName: 'Fase 2', verdict: 'positivo' });
    // 4 semanas do sucessor - 1 (veredito positivo), ativado numa transação só
    expect(mockDb.rpc).toHaveBeenCalledWith('activate_workout_plan', { p_plan_id: 'succ-next', p_start_date: todayDate(), p_duration_weeks: 3 });
  });

  it('ativa regression_plan_id (não next_plan_id) quando o veredito é negativo', async () => {
    evaluateCycleEvolution.mockResolvedValue({ verdict: 'negativo' });
    mockWorkoutPlans([
      { data: [activePlan({ next_plan_id: 'succ-next', regression_plan_id: 'succ-reg' })], error: null },
      { data: { id: 'succ-reg', name: 'Recuperação', duration_weeks: 4 }, error: null },
      { data: [{ id: 'succ-reg', name: 'Recuperação', created_at: '2024-01-01', start_date: isoDate(0), end_date: isoDate(28), duration_weeks: 6, next_plan_id: null, regression_plan_id: null }], error: null },
    ]);

    const result = await fetchActivePlan('u1', baseMeta);

    expect(result.id).toBe('succ-reg');
    expect(result.switchInfo.verdict).toBe('negativo');
  });

  it('semana de corrida repetida (regression = ela mesma) não soma as semanas extras do ciclo negativo', async () => {
    evaluateCycleEvolution.mockResolvedValue({ verdict: 'negativo' });
    mockWorkoutPlans([
      { data: [activePlan({ id: 'wk-3', duration_weeks: 1, next_plan_id: 'wk-4', regression_plan_id: 'wk-3' })], error: null },
      { data: { id: 'wk-3', name: 'Semana 3', duration_weeks: 1 }, error: null },
      { data: [{ id: 'wk-3', name: 'Semana 3', created_at: '2024-01-01', start_date: isoDate(0), end_date: isoDate(7), duration_weeks: 1, next_plan_id: 'wk-4', regression_plan_id: 'wk-3' }], error: null },
    ]);

    const result = await fetchActivePlan('u1', baseMeta);

    expect(result.id).toBe('wk-3');
    expect(mockDb.rpc).toHaveBeenCalledWith('activate_workout_plan', { p_plan_id: 'wk-3', p_start_date: todayDate(), p_duration_weeks: 1 });
  });

  it('gera um novo ciclo automaticamente quando não há sucessor configurado', async () => {
    evaluateCycleEvolution.mockResolvedValue({ verdict: 'neutro' });
    defaultRpcMock('gen-1'); // create_workout_plan cria e ativa gen-1
    mockWorkoutPlans([
      { data: [activePlan()], error: null }, // actives
      { data: [{ id: 'gen-1', name: 'Continuidade automática', created_at: '2024-01-01', start_date: isoDate(0), end_date: isoDate(21), duration_weeks: 3, next_plan_id: null, regression_plan_id: null }], error: null }, // actives (recursivo)
    ]);

    const result = await fetchActivePlan('u1', baseMeta);

    expect(result.id).toBe('gen-1');
    expect(result.switchInfo.toName).toContain('automática');
  });

  it('cai para geração automática se o sucessor configurado foi excluído', async () => {
    evaluateCycleEvolution.mockResolvedValue({ verdict: 'neutro' });
    defaultRpcMock('gen-2');
    mockWorkoutPlans([
      { data: [activePlan({ next_plan_id: 'ghost-id' })], error: null }, // actives
      { data: null, error: null }, // lookup do sucessor -> não existe mais
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

describe('banco sem as RPCs de plano (migration não aplicada)', () => {
  const MISSING = { code: 'PGRST202', message: 'Could not find the function public.create_workout_plan' };

  function recordWrites() {
    const writes = [];
    mockDb.from.mockImplementation((table) => {
      const chain = chainResolving((payload) => ({
        data: payload ? { id: table === 'workout_plans' ? 'legacy-plan' : 'day-id', ...payload } : null,
        error: null,
      }));
      const { insert, update, delete: del } = chain;
      chain.insert = (p) => { writes.push([table, 'insert', p]); return insert(p); };
      chain.update = (p) => { writes.push([table, 'update', p]); return update(p); };
      chain.delete = () => { writes.push([table, 'delete']); return del(); };
      return chain;
    });
    return writes;
  }

  it('isMissingRpc reconhece função ausente e ignora outros erros', () => {
    expect(isMissingRpc(MISSING)).toBe(true);
    expect(isMissingRpc({ code: '42883' })).toBe(true);
    expect(isMissingRpc({ code: '42501' })).toBe(false);
    expect(isMissingRpc(null)).toBe(false);
  });

  it('gerar novo treino cai no caminho antigo: cria plano, dias, exercícios e ativa', async () => {
    mockDb.rpc.mockResolvedValue({ data: null, error: MISSING });
    const writes = recordWrites();
    const days = [
      { dia: 'Segunda', foco: 'Peito', exercicios: [{ nome: 'Supino Reto com Barra', series: '4', reps: '8', descanso: '90s', tecnica: '' }], pos: [{ nome: 'Prancha', series: '3', reps: '30s', descanso: '', tecnica: '' }] },
      { dia: 'Terça', foco: 'Descanso', exercicios: [], pos: [] },
    ];

    const plan = await createGeneratedPlan('u1', 'Novo', days, 4);

    expect(plan.id).toBe('legacy-plan');
    expect(writes.filter(w => w[0] === 'plan_days')).toHaveLength(2);
    const ex = writes.find(w => w[0] === 'plan_exercises')[2];
    expect(ex.map(r => [r.nome, r.is_post_workout])).toEqual([['Supino Reto com Barra', false], ['Prancha', true]]);
    const activation = writes.filter(w => w[0] === 'workout_plans' && w[1] === 'update').map(w => w[2]);
    expect(activation[0]).toEqual({ is_active: false });
    expect(activation[1]).toMatchObject({ is_active: true, start_date: todayDate(), duration_weeks: 4 });
  });

  it('falha no meio apaga o plano incompleto', async () => {
    mockDb.rpc.mockResolvedValue({ data: null, error: MISSING });
    const writes = recordWrites();
    const base = mockDb.from.getMockImplementation();
    mockDb.from.mockImplementation((table) => table === 'plan_exercises'
      ? chainResolving({ data: null, error: { code: '23502', message: 'boom' } })
      : base(table));

    await expect(createGeneratedPlan('u1', 'Novo', [{ dia: 'Segunda', foco: '', exercicios: [{ nome: 'X' }], pos: [] }])).rejects.toMatchObject({ code: '23502' });
    expect(writes).toContainEqual(['workout_plans', 'delete']);
  });

  it('trocar de plano cai no caminho antigo', async () => {
    mockDb.rpc.mockResolvedValue({ data: null, error: MISSING });
    const writes = recordWrites();
    await setActivePlan('u1', 'p2', null);
    expect(writes.map(w => w[2])).toEqual([{ is_active: false }, { is_active: true, start_date: null, end_date: null, duration_weeks: null }]);
  });

  it('outros erros da RPC continuam sendo lançados', async () => {
    mockDb.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'rls' } });
    await expect(createGeneratedPlan('u1', 'Novo', [])).rejects.toMatchObject({ code: '42501' });
  });
});

describe('fetchActivePlan com plano do personal', () => {
  const plan = (end) => ({ id: 'p-trainer', name: 'Do personal', created_at: '2024-01-01', start_date: '2020-01-01', end_date: end, duration_weeks: 4, next_plan_id: null, regression_plan_id: null });

  function mockTrainerPlan(endDate) {
    mockDb.from.mockImplementation((table) => {
      if (table === 'workout_plans') {
        const chain = chainResolving(() => (chain._cols === 'created_by'
          ? { data: { created_by: 'trainer-1' }, error: null }
          : { data: [plan(endDate)], error: null }));
        return chain;
      }
      return chainResolving({ data: [], error: null });
    });
  }

  it('vencido: não gera ciclo novo nem troca, só marca como vencido', async () => {
    evaluateCycleEvolution.mockReset();
    mockTrainerPlan('2020-02-01');
    const result = await fetchActivePlan('u1', { peso: 80, altura: 180, nivel: 'iniciante', meta: 'massa' });
    expect(result).toMatchObject({ id: 'p-trainer', byTrainer: true, expiredNoSuccessor: true });
    expect(evaluateCycleEvolution).not.toHaveBeenCalled();
  });

  it('sem prazo: não ganha ciclo padrão automático', async () => {
    mockTrainerPlan(null);
    const result = await fetchActivePlan('u1', {});
    expect(result).toMatchObject({ byTrainer: true, endDate: null });
    expect(result.expiredNoSuccessor).toBeUndefined();
  });
});

describe('createRunningProgram', () => {
  let counter;
  let updates;

  beforeEach(() => {
    counter = 0;
    updates = [];
    mockDb.rpc.mockImplementation((fn, args) => {
      if (fn === 'create_workout_plan') {
        counter += 1;
        return Promise.resolve({ data: { id: `wk-${counter}`, name: args.p_name }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    mockDb.from.mockImplementation(() => {
      const chain = {
        update(payload) { chain._payload = payload; return chain; },
        delete() { chain._delete = true; return chain; },
        eq(col, id) { updates.push({ id, payload: chain._payload, del: chain._delete }); return chain; },
        then: (ok, bad) => Promise.resolve({ data: null, error: null }).then(ok, bad),
      };
      return chain;
    });
  });

  it('cria uma semana por plano, todas inativas, e ativa só a primeira por 1 semana', async () => {
    const first = await createRunningProgram('u1', { goal: '5k', nivel: 'intermediario' });

    const creates = mockDb.rpc.mock.calls.filter(([fn]) => fn === 'create_workout_plan');
    expect(creates).toHaveLength(8);
    creates.forEach(([, args]) => expect(args.p_activate).toBe(false));
    expect(creates[0][1].p_name).toBe('Corrida 5K · semana 1 de 8');
    expect(creates[0][1].p_days).toHaveLength(7);
    expect(first.id).toBe('wk-1');
    expect(mockDb.rpc).toHaveBeenCalledWith('activate_workout_plan', { p_plan_id: 'wk-1', p_start_date: todayDate(), p_duration_weeks: 1 });
    expect(mockDb.rpc.mock.calls.filter(([fn]) => fn === 'activate_workout_plan')).toHaveLength(1);
  });

  it('encadeia as semanas: próxima = seguinte, ruim = repete a mesma, última sem próxima', async () => {
    await createRunningProgram('u1', { goal: '5k', nivel: 'intermediario' });
    const linked = Object.fromEntries(updates.filter(u => u.payload && 'next_plan_id' in u.payload).map(u => [u.id, u.payload]));
    expect(linked['wk-1']).toEqual({ next_plan_id: 'wk-2', regression_plan_id: 'wk-1' });
    expect(linked['wk-7']).toEqual({ next_plan_id: 'wk-8', regression_plan_id: 'wk-7' });
    expect(linked['wk-8']).toEqual({ next_plan_id: null, regression_plan_id: 'wk-8' });
  });

  it('iniciante pedindo meia maratona recebe o programa de 10K', async () => {
    await createRunningProgram('u1', { goal: 'meia', nivel: 'iniciante' });
    expect(mockDb.rpc.mock.calls.filter(([fn]) => fn === 'create_workout_plan')).toHaveLength(10);
  });

  it('falha no meio apaga as semanas já criadas e propaga o erro', async () => {
    mockDb.rpc.mockImplementation((fn, args) => {
      if (fn !== 'create_workout_plan') return Promise.resolve({ data: null, error: null });
      counter += 1;
      return counter === 3
        ? Promise.resolve({ data: null, error: { code: 'XX', message: 'boom' } })
        : Promise.resolve({ data: { id: `wk-${counter}`, name: args.p_name }, error: null });
    });
    await expect(createRunningProgram('u1', { goal: '5k', nivel: 'intermediario' })).rejects.toMatchObject({ message: 'boom' });
    const deleted = updates.filter(u => u.del && String(u.id).startsWith('wk-')).map(u => u.id).sort();
    expect(deleted).toEqual(['wk-1', 'wk-2']);
  });
});
