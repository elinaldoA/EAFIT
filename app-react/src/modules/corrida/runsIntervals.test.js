// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Respostas em fila: a 1ª chamada ao banco devolve results[0], a 2ª results[1]...
const h = vi.hoisted(() => ({ results: [], calls: [] }));
vi.mock('../../lib/supabase', () => {
  const chain = () => {
    const q = {};
    ['select', 'eq', 'order', 'upsert'].forEach(m => {
      q[m] = (...a) => { h.calls.push([m, ...a]); return q; };
    });
    const next = () => Promise.resolve(h.results.length > 1 ? h.results.shift() : h.results[0]);
    q.single = next;
    q.then = (res, rej) => next().then(res, rej);
    return q;
  };
  return { db: { from: () => chain() } };
});

import { saveRun, fetchRuns } from './runs';

const MISSING = { message: 'column runs.intervals does not exist', code: '42703' };
const reps = [{ rep: 1, s: 98, m: 400 }, { rep: 2, s: 96, m: 401 }];
const run = (over = {}) => ({
  client_id: 'c1', run_date: '2026-11-05', started_at: '2026-11-05T10:00:00.000Z',
  duration_s: 1800, distance_m: 5000, splits: [], ...over,
});
const selects = () => h.calls.filter(c => c[0] === 'select').map(c => c[1]);

beforeEach(() => {
  localStorage.clear();
  h.calls = [];
  h.results = [{ data: null, error: null }];
});

describe('tiros do intervalado no banco', () => {
  it('corrida com tiros manda e lê a coluna intervals', async () => {
    h.results = [{ data: { ...run(), intervals: reps }, error: null }];
    const { run: saved, pending } = await saveRun('u1', run({ intervals: reps }));
    expect(pending).toBe(false);
    expect(h.calls.find(c => c[0] === 'upsert')[1]).toMatchObject({ intervals: reps, user_id: 'u1' });
    expect(selects()[0]).toContain('intervals');
    expect(saved.intervals).toEqual(reps);
  });

  it('corrida sem tiros não depende da migration (nem manda a coluna)', async () => {
    h.results = [{ data: run(), error: null }];
    await saveRun('u1', run({ intervals: null }));
    expect(h.calls.find(c => c[0] === 'upsert')[1]).not.toHaveProperty('intervals');
    expect(selects()[0]).not.toContain('intervals');
  });

  it('migration ainda não aplicada: salva a corrida sem os tiros, sem ir para a fila', async () => {
    h.results = [{ data: null, error: MISSING }, { data: run(), error: null }];
    const { pending } = await saveRun('u1', run({ intervals: reps }));
    expect(pending).toBe(false);
    const upserts = h.calls.filter(c => c[0] === 'upsert');
    expect(upserts).toHaveLength(2);
    expect(upserts[1][1]).not.toHaveProperty('intervals');
  });

  it('migration ainda não aplicada: a lista de corridas lê sem a coluna', async () => {
    h.results = [{ data: null, error: MISSING }, { data: [run()], error: null }];
    const list = await fetchRuns('u1');
    expect(list).toHaveLength(1);
    expect(list[0].intervals).toEqual([]);
    expect(selects()).toHaveLength(2);
    expect(selects()[1]).not.toContain('intervals');
  });

  it('outro erro na lista continua sendo erro', async () => {
    h.results = [{ data: null, error: { message: 'boom' } }];
    await expect(fetchRuns('u1')).rejects.toBeTruthy();
  });

  it('subida por km: manda e lê a coluna km_elev quando há dado', async () => {
    const kmElev = [[10, 2], [4, 6]];
    h.results = [{ data: { ...run(), km_elev: kmElev }, error: null }];
    const { run: saved } = await saveRun('u1', run({ km_elev: kmElev }));
    expect(h.calls.find(c => c[0] === 'upsert')[1]).toMatchObject({ km_elev: kmElev });
    expect(selects()[0]).toContain('km_elev');
    expect(saved.km_elev).toEqual(kmElev);
  });

  it('só a coluna que falta sai: sem km_elev, os tiros continuam sendo salvos', async () => {
    const missingKmElev = { message: 'column runs.km_elev does not exist', code: '42703' };
    h.results = [{ data: null, error: missingKmElev }, { data: { ...run(), intervals: reps }, error: null }];
    const { run: saved, pending } = await saveRun('u1', run({ intervals: reps, km_elev: [[1, 1]] }));
    expect(pending).toBe(false);
    const upserts = h.calls.filter(c => c[0] === 'upsert');
    expect(upserts).toHaveLength(2);
    expect(upserts[1][1]).toHaveProperty('intervals');
    expect(upserts[1][1]).not.toHaveProperty('km_elev');
    expect(saved.intervals).toEqual(reps);
  });

  it('lista: sem km_elev na tabela lê de novo sem ela e mantém intervals', async () => {
    h.results = [{ data: null, error: { message: 'column runs.km_elev does not exist' } }, { data: [{ ...run(), intervals: reps }], error: null }];
    const list = await fetchRuns('u1');
    expect(list[0].intervals).toEqual(reps);
    expect(list[0].km_elev).toEqual([]);
    expect(selects()[1]).toContain('intervals');
    expect(selects()[1]).not.toContain('km_elev');
  });

  it('lista: sem as duas colunas lê só as antigas', async () => {
    h.results = [
      { data: null, error: { message: 'column runs.km_elev does not exist' } },
      { data: null, error: { message: 'column runs.intervals does not exist' } },
      { data: [run()], error: null },
    ];
    expect(await fetchRuns('u1')).toHaveLength(1);
    expect(selects()).toHaveLength(3);
    expect(selects()[2]).not.toMatch(/intervals|km_elev/);
  });
});
