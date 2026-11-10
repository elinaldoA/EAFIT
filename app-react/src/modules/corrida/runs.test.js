// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ result: { data: null, error: null }, calls: [] }));
vi.mock('../../lib/supabase', () => {
  const chain = () => {
    const q = {};
    ['select', 'eq', 'order', 'upsert', 'delete'].forEach(m => {
      q[m] = (...a) => { h.calls.push([m, ...a]); return q; };
    });
    q.single = () => Promise.resolve(h.result);
    q.then = (res, rej) => Promise.resolve(h.result).then(res, rej);
    return q;
  };
  return { db: { from: table => { h.calls.push(['from', table]); return chain(); } } };
});

import {
  paceSeconds, formatPace, formatClock, formatKm, decimal, bestEffort, computeRunStats, newRecords, describeRecord,
  saveRun, flushPendingRuns, pendingRuns, fetchRuns, deleteRun, manualRun, canEditMeasures, editFormFrom, editRun,
  shoeUsage, shoeWear, defaultShoeId, rememberShoe, shoeWearNotice, commentError,
} from './runs';

const run = (over = {}) => ({
  client_id: 'c1', run_date: '2026-11-05', started_at: '2026-11-05T10:00:00.000Z',
  duration_s: 1800, distance_m: 5000, splits: [360, 360, 360, 360, 360], ...over,
});

beforeEach(() => {
  localStorage.clear();
  h.result = { data: null, error: null };
  h.calls = [];
});

describe('contas', () => {
  it('ritmo só a partir de 1 km', () => {
    expect(paceSeconds(1800, 5000)).toBe(360);
    expect(paceSeconds(300, 800)).toBeNull();
    expect(formatPace(365)).toBe('6:05');
    expect(formatPace(null)).toBe('–');
  });

  it('relógio e km', () => {
    expect(formatClock(2527)).toBe('42:07');
    expect(formatClock(3930)).toBe('1:05:30');
    expect(formatKm(5230)).toBe('5,23');
    expect(formatKm(5230, 1)).toBe('5,2');
    expect(decimal('5.23', 'en')).toBe('5.23');
    expect(decimal('5.23', 'pt')).toBe('5,23');
  });

  it('melhor esforço: menor soma de k splits seguidos', () => {
    expect(bestEffort([300, 280, 290, 260, 310], 2)).toBe(550);
    expect(bestEffort([300], 5)).toBeNull();
  });
});

describe('computeRunStats', () => {
  it('totais, recordes e km por semana', () => {
    const runs = [
      run(),
      run({ client_id: 'c2', run_date: '2026-10-28', duration_s: 3000, distance_m: 10000, splits: Array(10).fill(300) }),
    ];
    const s = computeRunStats(runs, '2026-11-05', 2);
    expect(s).toMatchObject({ count: 2, totalM: 15000, longestM: 10000, bestPace: 300 });
    expect(s.efforts).toEqual({ 1: 300, 5: 1500, 10: 3000, 21: null });
    expect(s.weeks).toEqual([{ start: '2026-10-26', meters: 10000 }, { start: '2026-11-02', meters: 5000 }]);
  });
});

describe('newRecords', () => {
  it('primeira corrida não é recorde', () => {
    expect(newRecords([], run())).toEqual([]);
  });

  it('acha distância, ritmo e melhor 1 km batidos', () => {
    const prev = [run({ distance_m: 3000, duration_s: 1200, splits: [400, 400, 400] })];
    const kinds = newRecords(prev, run()).map(r => (r.kind === 'effort' ? `effort${r.km}` : r.kind));
    expect(kinds).toEqual(['distance', 'pace', 'effort1']);
    expect(describeRecord({ kind: 'pace', value: 360 })).toBe('melhor ritmo: 6:00/km');
    expect(describeRecord({ kind: 'effort', km: 5, value: 1500 })).toBe('melhor 5 km: 25:00');
  });
});

describe('banco e fila do aparelho', () => {
  it('salva com upsert pelo client_id', async () => {
    h.result = { data: { ...run(), id: 'r1' }, error: null };
    const out = await saveRun('u1', run());
    expect(out.pending).toBe(false);
    expect(h.calls).toContainEqual(['upsert', { ...run(), user_id: 'u1' }, { onConflict: 'user_id,client_id' }]);
  });

  it('sem conexão guarda na fila e sobe depois, sem duplicar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    h.result = { data: null, error: new Error('offline') };
    expect((await saveRun('u1', run())).pending).toBe(true);
    await saveRun('u1', run());
    expect(pendingRuns('u1')).toHaveLength(1);

    h.result = { data: { ...run(), id: 'r1' }, error: null };
    expect(await flushPendingRuns('u1')).toBe(1);
    expect(pendingRuns('u1')).toEqual([]);
  });

  it('a lista junta a fila do aparelho com o banco', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    h.result = { data: null, error: new Error('offline') };
    await saveRun('u1', run({ client_id: 'local', started_at: '2026-11-06T10:00:00.000Z' }));
    h.result = { data: [{ ...run(), id: 'r1', splits: null }], error: null };
    const list = await fetchRuns('u1');
    expect(list.map(r => [r.client_id, !!r.pending])).toEqual([['local', true], ['c1', false]]);
    expect(list[1].splits).toEqual([]);
  });

  it('apagar da fila não chama o banco', async () => {
    localStorage.setItem('eafit_runs_pending', JSON.stringify({ u1: [run()] }));
    await deleteRun('u1', { ...run(), pending: true });
    expect(pendingRuns('u1')).toEqual([]);
    expect(h.calls).toEqual([]);
  });
});

describe('manualRun (corrida lançada à mão)', () => {
  const NOW = new Date(2026, 10, 6, 12, 0).getTime();
  const base = { date: '2026-11-06', time: '07:30', hours: '', minutes: '32', seconds: '10', km: '5,2' };

  it('monta o registro sem GPS, com título de esteira', () => {
    const { record, error } = manualRun({ ...base, treadmill: true }, NOW, () => 0.5);
    expect(error).toBeUndefined();
    expect(record).toMatchObject({
      run_date: '2026-11-06', duration_s: 1930, distance_m: 5200, splits: [], route: [],
      gps: false, kind: 'livre', title: 'Corrida na esteira', visibility: 'amigos',
    });
    expect(record.started_at).toBe(new Date(2026, 10, 6, 7, 30).toISOString());
    expect(record.client_id).toMatch(/^manual-/);
  });

  it('título digitado vale; na rua usa o título pela hora', () => {
    expect(manualRun({ ...base, title: '  Parque  ' }, NOW).record.title).toBe('Parque');
    expect(manualRun(base, NOW).record.title).toBe('Corrida da manhã');
  });

  it('recusa tempo, distância ou data inválidos e corrida no futuro', () => {
    expect(manualRun({ ...base, minutes: '', seconds: '' }, NOW).error).toMatch(/tempo/);
    expect(manualRun({ ...base, km: '0' }, NOW).error).toMatch(/Distância/);
    expect(manualRun({ ...base, km: 'abc' }, NOW).error).toMatch(/Distância/);
    expect(manualRun({ ...base, date: '' }, NOW).error).toMatch(/data/);
    expect(manualRun({ ...base, time: '11:45' }, NOW).error).toMatch(/futuro/);
  });
});

describe('tênis', () => {
  const shoes = [
    { id: 'a', name: 'Azul', initial_m: 100000, limit_m: 700000, retired: false },
    { id: 'b', name: 'Velho', initial_m: 0, limit_m: 500000, retired: true },
  ];

  it('soma os km de cada tênis: o que já tinha rodado mais as corridas', () => {
    const runs = [{ shoe_id: 'a', distance_m: 5000 }, { shoe_id: 'a', distance_m: 7000 }, { shoe_id: 'b', distance_m: 3000 }, { shoe_id: null, distance_m: 9000 }, { shoe_id: 'x', distance_m: 1 }];
    expect(shoeUsage(shoes, runs)).toEqual({ a: 112000, b: 3000 });
  });

  it('avisa perto da vida útil e quando passa', () => {
    expect(shoeWear(shoes[0], 600000)).toBe('ok');
    expect(shoeWear(shoes[0], 640000)).toBe('warn');
    expect(shoeWear(shoes[0], 700000)).toBe('over');
    expect(shoeWearNotice(shoes[0], 600000, 10000)).toBeNull();
    expect(shoeWearNotice(shoes[0], 625000, 10000)).toMatch(/perto do fim/);
    expect(shoeWearNotice(shoes[0], 695000, 10000)).toMatch(/passou de 700 km/);
    expect(shoeWearNotice(shoes[0], 710000, 10000)).toBeNull();
  });

  it('sugere o último tênis usado, se ainda ativo; senão o único ativo', () => {
    localStorage.clear();
    expect(defaultShoeId(shoes)).toBe('a');
    rememberShoe('b');
    expect(defaultShoeId(shoes)).toBe('a');
    expect(defaultShoeId([...shoes, { id: 'c', retired: false }])).toBeNull();
    rememberShoe('c');
    expect(defaultShoeId([...shoes, { id: 'c', retired: false }])).toBe('c');
  });

  it('corrida lançada à mão leva o tênis', () => {
    const { record } = manualRun({ date: '2026-11-06', time: '07:00', minutes: '30', km: '5', shoeId: 'a' }, new Date(2026, 10, 6, 12).getTime());
    expect(record).toMatchObject({ shoe_id: 'a', elev_gain_m: null, cadence: null });
  });
});

describe('comentários', () => {
  it('traduz os erros do banco para a pessoa', () => {
    expect(commentError({ message: 'blocked_word' })).toMatch(/palavra/);
    expect(commentError({ message: 'rate_limited' })).toMatch(/espere/);
    expect(commentError({ message: 'blocked' })).toMatch(/não pode comentar/);
    expect(commentError({ message: 'not_found' })).toMatch(/não está mais/);
    expect(commentError(new Error('rede'))).toMatch(/tente de novo/);
  });
});

describe('clubes', () => {
  it('rankRows: empate divide a posição e quem ocultou fica sem posição', async () => {
    const { rankRows } = await import('./runs');
    const rows = rankRows([
      { name: 'A', meters: 9000, hidden: false },
      { name: 'B', meters: 9000, hidden: false },
      { name: 'C', meters: 4000, hidden: false },
      { name: 'D', meters: 0, hidden: true },
    ]);
    expect(rows.map(r => r.rank)).toEqual([1, 1, 3, null]);
  });

  it('normalizeClubCode tira espaços e símbolos', async () => {
    const { normalizeClubCode } = await import('./runs');
    expect(normalizeClubCode(' ab-12 cd ')).toBe('AB12CD');
  });

  it('clubError traduz o erro do banco', async () => {
    const { clubError } = await import('./runs');
    expect(clubError(new Error('invalid_code'))).toMatch(/não encontrado/);
    expect(clubError(new Error('blocked_word'))).toMatch(/palavra/);
    expect(clubError(new Error('algo'))).toMatch(/tente de novo/);
  });
});

describe('editar corrida', () => {
  const manual = {
    client_id: 'm1', run_date: '2026-11-01', started_at: new Date(2026, 10, 1, 7, 30).toISOString(),
    duration_s: 1800, distance_m: 5000, splits: [], route: [], gps: false, intervals: [], effort: 5, notes: 'ok', title: 'Esteira', visibility: 'amigos', shoe_id: null,
  };
  const gps = { ...manual, gps: true, splits: [350, 340, 360, 350, 355] };
  const NOW = new Date(2026, 10, 10, 12).getTime();

  it('só a corrida lançada à mão edita distância e tempo', () => {
    expect(canEditMeasures(manual)).toBe(true);
    expect(canEditMeasures(gps)).toBe(false);
  });

  it('o formulário nasce com os valores da corrida', () => {
    const f = editFormFrom(manual);
    expect(f).toMatchObject({ date: '2026-11-01', time: '07:30', hours: '0', minutes: '30', seconds: '0', effort: 5, notes: 'ok' });
  });

  it('corrige distância e tempo da corrida à mão', () => {
    const form = { ...editFormFrom(manual), km: '5,5', minutes: '32', seconds: '10' };
    const { patch } = editRun(manual, form, NOW);
    expect(patch.distance_m).toBe(5500);
    expect(patch.duration_s).toBe(1930);
    expect(patch.run_date).toBe('2026-11-01');
  });

  it('corrida do GPS ignora distância e tempo do formulário', () => {
    const form = { ...editFormFrom(gps), km: '9', minutes: '5', title: '  Longão ', effort: 8, visibility: 'privado' };
    const { patch } = editRun(gps, form, NOW);
    expect(patch).toEqual({ title: 'Longão', notes: 'ok', effort: 8, visibility: 'privado', shoe_id: null });
  });

  it('recusa distância inválida e limpa campos vazios', () => {
    expect(editRun(manual, { ...editFormFrom(manual), km: '0' }, NOW).error).toBeTruthy();
    const { patch } = editRun(gps, { ...editFormFrom(gps), title: '', notes: '', effort: 99 }, NOW);
    expect(patch).toMatchObject({ title: null, notes: null, effort: null });
  });
});
