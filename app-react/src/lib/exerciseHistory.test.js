import { describe, it, expect } from 'vitest';
import { sessionsFromSets, lastSessionSets } from './exerciseHistory';

const sets = [
  { workout_date: '2027-03-01', set_number: 1, carga: 60, reps: 10 },
  { workout_date: '2027-03-01', set_number: 2, carga: 60, reps: 8 },
  { workout_date: '2027-03-08', set_number: 2, carga: 62.5, reps: 8 },
  { workout_date: '2027-03-08', set_number: 1, carga: 62.5, reps: 10 },
  { workout_date: '2027-03-08', set_number: 3, carga: null, reps: 5 },
];

describe('sessionsFromSets', () => {
  it('agrupa por data, do mais recente ao mais antigo', () => {
    const r = sessionsFromSets(sets);
    expect(r.map(s => s.date)).toEqual(['2027-03-08', '2027-03-01']);
    expect(r[0]).toMatchObject({ topCarga: 62.5, topReps: 10, sets: 2, volume: 1125 });
    expect(r[0].oneRm).toBeCloseTo(83.3, 1);
  });
  it('respeita o limite e ignora séries sem carga', () => {
    expect(sessionsFromSets(sets, 1)).toHaveLength(1);
    expect(sessionsFromSets([{ workout_date: 'x', carga: null, reps: 5 }])).toEqual([]);
  });
});

describe('lastSessionSets', () => {
  it('devolve a última sessão na ordem das séries', () => {
    expect(lastSessionSets(sets)).toEqual([{ carga: 62.5, reps: 10 }, { carga: 62.5, reps: 8 }]);
  });
  it('ignora hoje e depois quando beforeDate é dado', () => {
    expect(lastSessionSets(sets, '2027-03-08')).toEqual([{ carga: 60, reps: 10 }, { carga: 60, reps: 8 }]);
    expect(lastSessionSets([], '2027-03-08')).toEqual([]);
  });
});
