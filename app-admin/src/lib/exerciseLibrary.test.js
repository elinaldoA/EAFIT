import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import { validateExercise, filterExercises, toDraft, friendlyLibraryError, EMPTY_EXERCISE } from './exerciseLibrary';

describe('validateExercise', () => {
  it('aceita um exercício completo e apara os textos', () => {
    const r = validateExercise({ ...EMPTY_EXERCISE, nome: '  Supino Reto  ', grupo_muscular: ' Peito ', equipamento: ' Barra ' });
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({ nome: 'Supino Reto', grupo_muscular: 'peito', equipamento: 'barra' });
  });

  it('exige nome e grupo muscular', () => {
    const r = validateExercise({ ...EMPTY_EXERCISE });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors)).toEqual(expect.arrayContaining(['nome', 'grupo_muscular']));
  });

  it('recusa tipo e nível fora da lista e séries/reps/descanso vazios', () => {
    const r = validateExercise({ ...EMPTY_EXERCISE, nome: 'X', grupo_muscular: 'peito', tipo: 'xyz', nivel_minimo: 'deus', series: ' ', reps: '', descanso: '' });
    expect(Object.keys(r.errors).sort()).toEqual(['descanso', 'nivel_minimo', 'reps', 'series', 'tipo']);
  });
});

describe('toDraft', () => {
  it('preenche o que faltar com o padrão e troca null por padrão', () => {
    expect(toDraft({ nome: 'A', equipamento: null })).toMatchObject({ nome: 'A', equipamento: '', series: '3' });
  });
});

describe('filterExercises', () => {
  const rows = [
    { nome: 'Supino Reto', grupo_muscular: 'peito', tipo: 'composto', nivel_minimo: 'iniciante', plans_count: 3, discomfort_count: 0, has_media: true },
    { nome: 'Crucifixo', grupo_muscular: 'peito', tipo: 'isolado', nivel_minimo: 'intermediario', plans_count: 0, discomfort_count: 2, has_media: false },
    { nome: 'Agachamento', grupo_muscular: 'pernas', tipo: 'composto', nivel_minimo: 'iniciante', plans_count: 1, discomfort_count: 0, has_media: false },
  ];

  it('filtra por busca, grupo, tipo e nível', () => {
    expect(filterExercises(rows, { search: 'sup' }).map(r => r.nome)).toEqual(['Supino Reto']);
    expect(filterExercises(rows, { grupo: 'peito' })).toHaveLength(2);
    expect(filterExercises(rows, { tipo: 'isolado' }).map(r => r.nome)).toEqual(['Crucifixo']);
    expect(filterExercises(rows, { nivel: 'iniciante' })).toHaveLength(2);
  });

  it('filtra por problema: dor, sem uso, sem mídia', () => {
    expect(filterExercises(rows, { problema: 'dor' }).map(r => r.nome)).toEqual(['Crucifixo']);
    expect(filterExercises(rows, { problema: 'sem-uso' }).map(r => r.nome)).toEqual(['Crucifixo']);
    expect(filterExercises(rows, { problema: 'sem-midia' }).map(r => r.nome)).toEqual(['Crucifixo', 'Agachamento']);
  });
});

describe('friendlyLibraryError', () => {
  it('traduz nome duplicado e permissão', () => {
    expect(friendlyLibraryError({ code: '23505' })).toMatch(/Já existe/);
    expect(friendlyLibraryError({ message: 'new row violates row-level security policy' })).toMatch(/papel/);
    expect(friendlyLibraryError({ message: 'outro' })).toBe('outro');
  });
});
