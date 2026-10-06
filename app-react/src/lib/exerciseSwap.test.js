import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import { normalizeName, findLibraryRow, pickAlternatives } from './exerciseSwap';

const lib = [
  { nome: 'Supino Reto com Barra', grupo_muscular: 'peito', tipo: 'composto', equipamento: 'barra', nivel_minimo: 'iniciante', is_post_workout: false },
  { nome: 'Supino Reto com Halteres', grupo_muscular: 'peito', tipo: 'composto', equipamento: 'halteres', nivel_minimo: 'iniciante', is_post_workout: false },
  { nome: 'Supino Inclinado com Barra', grupo_muscular: 'peito', tipo: 'composto', equipamento: 'barra', nivel_minimo: 'intermediario', is_post_workout: false },
  { nome: 'Supino Declinado', grupo_muscular: 'peito', tipo: 'composto', equipamento: 'barra', nivel_minimo: 'avancado', is_post_workout: false },
  { nome: 'Crucifixo', grupo_muscular: 'peito', tipo: 'isolado', equipamento: 'halteres', nivel_minimo: 'iniciante', is_post_workout: false },
  { nome: 'Agachamento', grupo_muscular: 'quadriceps', tipo: 'composto', equipamento: 'barra', nivel_minimo: 'iniciante', is_post_workout: false },
  { nome: 'Flexão', grupo_muscular: 'peito', tipo: 'composto', equipamento: 'peso corporal', nivel_minimo: 'iniciante', is_post_workout: true },
];

describe('normalizeName', () => {
  it('tira o emoji de prefixo e ignora caixa', () => {
    expect(normalizeName('🔷 Prancha com Peso')).toBe('prancha com peso');
    expect(normalizeName('  Supino ')).toBe('supino');
  });
});

describe('findLibraryRow', () => {
  it('acha por nome ignorando caixa e emoji', () => {
    expect(findLibraryRow(lib, 'supino reto com barra')?.equipamento).toBe('barra');
    expect(findLibraryRow(lib, 'Exercício que não existe')).toBeNull();
  });
});

describe('pickAlternatives', () => {
  const current = { nome: 'Supino Reto com Barra' };

  it('mesmo grupo e tipo, mesmo equipamento primeiro, sem o atual', () => {
    const { known, options } = pickAlternatives({ current, library: lib, nivel: 'avancado' });
    expect(known).toBe(true);
    expect(options.map(o => o.nome)).toEqual(['Supino Declinado', 'Supino Inclinado com Barra', 'Supino Reto com Halteres']);
  });

  it('respeita o nível do usuário', () => {
    const { options } = pickAlternatives({ current, library: lib, nivel: 'iniciante' });
    expect(options.map(o => o.nome)).toEqual(['Supino Reto com Halteres']);
  });

  it('nível desconhecido conta como intermediário', () => {
    const { options } = pickAlternatives({ current, library: lib, nivel: undefined });
    expect(options.map(o => o.nome)).toEqual(['Supino Inclinado com Barra', 'Supino Reto com Halteres']);
  });

  it('exclui exercícios do dia e os que causaram dor', () => {
    const { options } = pickAlternatives({
      current, library: lib, nivel: 'avancado',
      dayNames: ['Supino Inclinado com Barra'], avoidNames: ['supino declinado'],
    });
    expect(options.map(o => o.nome)).toEqual(['Supino Reto com Halteres']);
  });

  it('não sugere pós-treino nem outro tipo/grupo', () => {
    const { options } = pickAlternatives({ current, library: lib, nivel: 'avancado' });
    expect(options.some(o => o.nome === 'Flexão' || o.nome === 'Crucifixo' || o.nome === 'Agachamento')).toBe(false);
  });

  it('exercício fora da biblioteca: known false', () => {
    expect(pickAlternatives({ current: { nome: 'Afundo Búlgaro (foco glúteo)' }, library: lib, nivel: 'iniciante' }))
      .toEqual({ known: false, options: [] });
  });

  it('respeita o limite', () => {
    expect(pickAlternatives({ current, library: lib, nivel: 'avancado', limit: 1 }).options).toHaveLength(1);
  });
});
