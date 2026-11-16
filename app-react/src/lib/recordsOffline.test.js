import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockDb } = vi.hoisted(() => ({ mockDb: { from: vi.fn() } }));
vi.mock('./supabase', () => ({ db: mockDb }));

import { checkForNewPR } from './records';
import { enqueue } from './syncQueue';

// Query builder encadeável que resolve para `result` (igual ao supabase-js).
function chainResolving(result) {
  const c = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') return (res, rej) => Promise.resolve(result).then(res, rej);
      return () => c;
    },
  });
  return c;
}

function serverHas(sets) {
  mockDb.from.mockImplementation(() => chainResolving({ data: sets, error: null }));
}
function serverDown() {
  mockDb.from.mockImplementation(() => chainResolving({ data: null, error: { message: 'down' } }));
}
const set = (carga, reps = 8) => ({ workout_id: 'w0', set_number: 1, carga, reps });

function goOffline() { vi.stubGlobal('navigator', { onLine: false }); }

beforeEach(() => {
  mockDb.from.mockReset();
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('checkForNewPR — com rede', () => {
  it('compara com o histórico do servidor e guarda as melhores marcas no aparelho', async () => {
    serverHas([set(100, 8)]);
    expect(await checkForNewPR('u1', 'Supino', 110, 8)).toMatchObject({ isCargaPR: true });
    serverHas([set(100, 8), set(110, 8)]); // a série de 110 kg já foi salva
    expect(await checkForNewPR('u1', 'Supino', 90, 5)).toBeNull();
    const cache = JSON.parse(localStorage.getItem('pr_best'));
    expect(cache.userId).toBe('u1');
    expect(cache.items.Supino.bestCarga).toBe(110); // inclui a série recém-feita
  });

  it('servidor fora do ar: usa as marcas guardadas em vez de perder o recorde', async () => {
    serverHas([set(100, 8)]);
    await checkForNewPR('u1', 'Supino', 90, 8);
    serverDown();
    expect(await checkForNewPR('u1', 'Supino', 120, 8)).toMatchObject({ isCargaPR: true });
  });
});

describe('checkForNewPR — sem rede', () => {
  async function seedOnline() {
    serverHas([set(100, 8)]);
    await checkForNewPR('u1', 'Supino', 100, 8);
    mockDb.from.mockClear();
    goOffline();
  }

  it('detecta recorde sem consultar o servidor', async () => {
    await seedOnline();
    expect(await checkForNewPR('u1', 'Supino', 105, 8)).toMatchObject({ isCargaPR: true, carga: 105 });
    expect(mockDb.from).not.toHaveBeenCalled();
  });

  it('série mais leve que a melhor marca não é recorde', async () => {
    await seedOnline();
    expect(await checkForNewPR('u1', 'Supino', 80, 5)).toBeNull();
  });

  it('o recorde feito offline vira a marca a bater na mesma sessão', async () => {
    await seedOnline();
    expect(await checkForNewPR('u1', 'Supino', 110, 8)).not.toBeNull();
    expect(await checkForNewPR('u1', 'Supino', 105, 8)).toBeNull();
    expect(await checkForNewPR('u1', 'Supino', 115, 8)).not.toBeNull();
  });

  it('só reps maiores com a mesma carga contam pelo 1RM estimado', async () => {
    await seedOnline();
    const pr = await checkForNewPR('u1', 'Supino', 100, 12);
    expect(pr).toMatchObject({ isCargaPR: false, isOneRmPR: true });
  });

  it('exercício nunca consultado antes não é chamado de recorde (histórico desconhecido)', async () => {
    goOffline();
    expect(await checkForNewPR('u1', 'Agachamento', 200, 5)).toBeNull();
  });

  it('exercício sem histórico no servidor: depois da primeira série, a seguinte mais pesada bate', async () => {
    serverHas([]);
    await checkForNewPR('u1', 'Rosca', 10, 10);
    goOffline();
    expect(await checkForNewPR('u1', 'Rosca', 12, 10)).not.toBeNull();
  });

  it('marcas de outro usuário no aparelho são ignoradas', async () => {
    await seedOnline();
    expect(await checkForNewPR('u2', 'Supino', 150, 8)).toBeNull();
  });

  it('carga inválida devolve null sem mexer em nada', async () => {
    goOffline();
    expect(await checkForNewPR('u1', 'Supino', '', 8)).toBeNull();
  });
});

describe('checkForNewPR — marcas offline e a fila', () => {
  it('depois que a fila esvazia e o servidor responde, as marcas locais saem do cache', async () => {
    serverHas([set(100, 8)]);
    await checkForNewPR('u1', 'Supino', 100, 8);
    goOffline();
    await checkForNewPR('u1', 'Supino', 110, 8);
    expect(JSON.parse(localStorage.getItem('pr_best')).items.Supino.localCarga).toBe(110);

    vi.unstubAllGlobals();
    serverHas([set(100, 8), set(110, 8)]); // a série offline já subiu
    await checkForNewPR('u1', 'Supino', 90, 8);
    expect(JSON.parse(localStorage.getItem('pr_best')).items.Supino.localCarga).toBeNull();
  });

  it('com escrita ainda na fila, a marca local é mantida mesmo com o servidor respondendo', async () => {
    serverHas([set(100, 8)]);
    await checkForNewPR('u1', 'Supino', 100, 8);
    goOffline();
    await checkForNewPR('u1', 'Supino', 110, 8);

    vi.unstubAllGlobals();
    enqueue('set_state', { workout_id: 'w1', exercise_name: 'Supino', set_number: 1, patch: { carga: 110 } });
    serverHas([set(100, 8)]); // servidor ainda sem os 110
    await checkForNewPR('u1', 'Supino', 90, 8);
    expect(JSON.parse(localStorage.getItem('pr_best')).items.Supino.localCarga).toBe(110);
  });
});
