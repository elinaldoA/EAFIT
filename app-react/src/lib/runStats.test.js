import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb } = vi.hoisted(() => ({ mockDb: { from: vi.fn() } }));
vi.mock('./supabase', () => ({ db: mockDb }));

import { isRunItem, paceSeconds, formatPaceSeconds, computeRunStats, checkForRunPR, fetchRuns } from './runStats';

const run = (date, minutes, km, extra = {}) => ({ date, nome: 'Corrida Leve (Trote)', minutes, km, ...extra });

describe('isRunItem / pace', () => {
  it('reconhece itens de corrida e ignora o resto', () => {
    ['Corrida Leve (Trote)', 'Corrida Contínua (Longão)', 'Caminhada e Corrida Alternadas', 'Fartlek (variação de ritmo)'].forEach(n => expect(isRunItem(n)).toBe(true));
    ['Cardio — Esteira', 'Bicicleta ou Natação', 'Supino Reto com Barra'].forEach(n => expect(isRunItem(n)).toBe(false));
  });

  it('ritmo em s/km, só a partir de 1 km', () => {
    expect(paceSeconds(30, 5)).toBe(360);
    expect(paceSeconds('27,5', '5')).toBe(330);
    expect(paceSeconds(5, 0.5)).toBeNull();
    expect(paceSeconds(null, 5)).toBeNull();
    expect(formatPaceSeconds(330)).toBe('5:30');
    expect(formatPaceSeconds(305)).toBe('5:05');
  });
});

describe('computeRunStats', () => {
  // 2026-10-14 é quarta; a semana atual começa na segunda 2026-10-12
  const today = '2026-10-14';
  const runs = [
    run('2026-10-13', 30, 5),
    run('2026-10-06', 60, 10),
    run('2026-10-07', 25, 5.5),
    run('2026-09-01', 20, 3),
  ];

  it('soma, maiores marcas e melhor ritmo', () => {
    const s = computeRunStats(runs, today);
    expect(s.count).toBe(4);
    expect(s.totalKm).toBe(23.5);
    expect(s.longestKm).toBe(10);
    expect(s.longestMin).toBe(60);
    expect(s.bestPace).toBe(Math.round((25 * 60) / 5.5)); // 273 s/km
  });

  it('km das últimas 4 semanas, da mais antiga à atual', () => {
    const s = computeRunStats(runs, today);
    expect(s.weeks.map(w => w.start)).toEqual(['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12']);
    expect(s.weeks.map(w => w.km)).toEqual([0, 0, 15.5, 5]);
  });

  it('sem corridas devolve zeros', () => {
    const s = computeRunStats([], today);
    expect(s).toMatchObject({ count: 0, totalKm: 0, longestKm: 0, bestPace: null });
    expect(s.weeks).toHaveLength(4);
  });
});

describe('checkForRunPR', () => {
  function stub(rows) {
    const chain = { select: () => chain, eq: () => chain, not: () => Promise.resolve({ data: rows, error: null }) };
    mockDb.from.mockReturnValue(chain);
  }
  const row = (id, n, minutes, km) => ({
    workout_id: id, set_number: n, exercise_name: 'Corrida Leve (Trote)', duracao_min: minutes, distancia_km: km,
    workouts: { user_id: 'u1', workout_date: '2026-10-01' },
  });
  beforeEach(() => mockDb.from.mockReset());

  it('distância e ritmo recordes', async () => {
    stub([row('w1', 1, 30, 5)]); // 6:00/km, 5 km
    expect(await checkForRunPR('u1', { minutes: 27, km: 5.5 })).toEqual([
      { kind: 'distance', value: 5.5 },
      { kind: 'pace', value: 295 },
    ]);
  });

  it('só um dos dois quando o outro não melhora', async () => {
    stub([row('w1', 1, 30, 5)]);
    expect(await checkForRunPR('u1', { minutes: 40, km: 6 })).toEqual([{ kind: 'distance', value: 6 }]);
    expect(await checkForRunPR('u1', { minutes: 20, km: 4 })).toEqual([{ kind: 'pace', value: 300 }]);
  });

  it('primeira corrida, empate ou pior em tudo não é recorde', async () => {
    stub([]);
    expect(await checkForRunPR('u1', { minutes: 30, km: 5 })).toBeNull();
    stub([row('w1', 1, 30, 5)]);
    expect(await checkForRunPR('u1', { minutes: 30, km: 5 })).toBeNull();
    expect(await checkForRunPR('u1', { minutes: 40, km: 4 })).toBeNull();
  });

  it('a própria corrida é excluída da comparação', async () => {
    stub([row('w1', 1, 30, 5)]);
    expect(await checkForRunPR('u1', { minutes: 25, km: 6 }, { workoutId: 'w1', setNumber: 1 })).toBeNull();
  });

  it('fetchRuns ignora itens que não são corrida', async () => {
    stub([row('w1', 1, 30, 5), { ...row('w2', 1, 40, 10), exercise_name: 'Cardio — Esteira' }]);
    expect(await fetchRuns('u1')).toHaveLength(1);
  });
});
