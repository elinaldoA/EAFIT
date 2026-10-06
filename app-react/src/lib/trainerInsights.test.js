import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import { buildSessions, formatSets, formatDurationMin, friendlyInsightError, progressionSuggestions, nextLoad } from './trainerInsights';

const set = (exercise, n, carga, reps) => ({ exercise, n, carga, reps });

// do mais recente ao mais antigo, como o banco devolve
const sessions = [
  { id: 'c', date: '2026-10-08', day: 'Segunda', completed: true, duration: 3600, rating: 4, notes: 'Ombro doeu', sets: [set('Supino', 1, 30, 8), set('Supino', 2, 28, 8), set('Remada', 1, 40, 10)] },
  { id: 'b', date: '2026-10-05', day: 'Sexta', completed: true, duration: null, rating: null, notes: null, sets: [set('Remada', 1, 42, 10)] },
  { id: 'a', date: '2026-10-01', day: 'Segunda', completed: true, duration: 3000, rating: 5, notes: '', sets: [set('Supino', 1, 26, 10), set('Supino', 2, 26, 9)] },
];

describe('buildSessions', () => {
  it('compara a carga máxima com a última sessão que teve o exercício', () => {
    const out = buildSessions(sessions);
    expect(out.map(s => s.id)).toEqual(['c', 'b', 'a']);

    const c = out[0];
    const supino = c.exercises.find(e => e.name === 'Supino');
    expect(supino).toMatchObject({ top: 30, prevTop: 26, delta: 4 });
    const remada = c.exercises.find(e => e.name === 'Remada');
    expect(remada).toMatchObject({ top: 40, prevTop: 42, delta: -2 });
    expect(c).toMatchObject({ improved: 1, dropped: 1, rating: 4, notes: 'Ombro doeu' });
  });

  it('a primeira ocorrência do exercício não tem comparação', () => {
    const out = buildSessions(sessions);
    const first = out[2].exercises[0];
    expect(first).toMatchObject({ top: 26, prevTop: null, delta: null });
  });

  it('séries sem carga não quebram e campos nulos viram vazios', () => {
    const out = buildSessions([{ id: 'x', date: '2026-10-09', day: 'Sábado', completed: false, duration: null, rating: null, notes: null, sets: [set('Corrida', 1, null, 20)] }]);
    expect(out[0].exercises[0]).toMatchObject({ top: null, delta: null });
    expect(out[0].notes).toBe('');
    expect(buildSessions([])).toEqual([]);
  });
});

describe('formatadores', () => {
  it('formata séries e duração', () => {
    expect(formatSets([{ carga: 26, reps: 10 }, { carga: 27.5, reps: 8 }])).toBe('26×10 · 27,5×8');
    expect(formatSets([{ carga: null, reps: 20 }])).toBe('20 reps');
    expect(formatDurationMin(3540)).toBe('59 min');
    expect(formatDurationMin(null)).toBeNull();
    expect(formatDurationMin(10)).toBe('1 min');
  });
  it('traduz erros', () => {
    expect(friendlyInsightError({ message: 'invalid_goals' })).toMatch(/1 a 7 treinos/);
    expect(friendlyInsightError({ message: 'q' })).toMatch(/Tente de novo/);
  });
});

describe('progressionSuggestions', () => {
  const session = (id, sets) => ({ id, date: `2026-10-0${id}`, day: 'x', completed: true, sets });
  const sets = (exercise, carga, reps, n = 3) => Array.from({ length: n }, (_, i) => ({ exercise, n: i + 1, carga, reps }));
  // do mais recente (id maior) ao mais antigo, como vem do banco
  const build = list => buildSessions(list);

  it('sugere subir quando repete a carga com 12+ repetições duas vezes', () => {
    const s = build([session(3, sets('Supino', 40, 12)), session(2, sets('Supino', 40, 13)), session(1, sets('Supino', 35, 10))]);
    expect(progressionSuggestions(s)).toEqual([{ name: 'Supino', kind: 'subir', top: 40, next: 42.5 }]);
  });

  it('não sugere se as repetições ficaram abaixo da meta', () => {
    const s = build([session(2, sets('Supino', 40, 8)), session(1, sets('Supino', 40, 9))]);
    expect(progressionSuggestions(s)).toEqual([]);
  });

  it('marca estagnado: mesma carga 3 vezes sem ganhar repetições', () => {
    const s = build([session(3, sets('Remada', 30, 8)), session(2, sets('Remada', 30, 8)), session(1, sets('Remada', 30, 9))]);
    expect(progressionSuggestions(s)).toEqual([{ name: 'Remada', kind: 'estagnado', top: 30 }]);
  });

  it('não marca estagnado se as repetições estão subindo', () => {
    const s = build([session(3, sets('Remada', 30, 10)), session(2, sets('Remada', 30, 9)), session(1, sets('Remada', 30, 8))]);
    expect(progressionSuggestions(s)).toEqual([]);
  });

  it('nextLoad usa passos menores para cargas leves', () => {
    expect(nextLoad(10)).toBe(11);
    expect(nextLoad(20)).toBe(22);
    expect(nextLoad(50)).toBe(52.5);
  });
});
