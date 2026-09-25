import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb } = vi.hoisted(() => ({ mockDb: { from: vi.fn() } }));
vi.mock('../lib/supabase', () => ({ db: mockDb }));

import { pickExercisesForFoco, withLibraryExercises, allowedNiveis, FOCO_TO_GRUPOS } from './exerciseLibrary';

function row(nome, tipo, grupo_muscular = 'peito') {
  return { nome, tipo, grupo_muscular, series: '3', reps: '10-12', descanso: '60s', tecnica: 'x' };
}

describe('pickExercisesForFoco', () => {
  it('prioriza compostos: até compostoCount vêm do grupo composto quando disponível', () => {
    const candidates = [
      row('C1', 'composto'), row('C2', 'composto'), row('C3', 'composto'),
      row('I1', 'isolado'), row('I2', 'isolado'), row('I3', 'isolado'), row('I4', 'isolado'),
    ];
    const picked = pickExercisesForFoco(candidates, { count: 5, compostoCount: 2 });

    expect(picked).toHaveLength(5);
    const compostosPicked = picked.filter(p => ['C1', 'C2', 'C3'].includes(p.nome));
    expect(compostosPicked.length).toBeGreaterThanOrEqual(2);
  });

  it('nunca repete o mesmo exercício na seleção', () => {
    const candidates = [row('C1', 'composto'), row('I1', 'isolado'), row('I2', 'isolado')];
    const picked = pickExercisesForFoco(candidates, { count: 5, compostoCount: 2 });
    const names = picked.map(p => p.nome);
    expect(new Set(names).size).toBe(names.length);
  });

  it('todo item retornado veio da lista de candidatos', () => {
    const candidates = [row('C1', 'composto'), row('C2', 'composto'), row('I1', 'isolado'), row('I2', 'isolado')];
    const picked = pickExercisesForFoco(candidates, { count: 3, compostoCount: 2 });
    const candidateNames = new Set(candidates.map(c => c.nome));
    picked.forEach(p => expect(candidateNames.has(p.nome)).toBe(true));
  });

  it('se faltar isolado, completa com compostos restantes sem estourar o total', () => {
    const candidates = [row('C1', 'composto'), row('C2', 'composto'), row('C3', 'composto'), row('I1', 'isolado')];
    const picked = pickExercisesForFoco(candidates, { count: 5, compostoCount: 2 });
    expect(picked.length).toBeLessThanOrEqual(4); // só há 4 candidatos no total
    expect(new Set(picked.map(p => p.nome)).size).toBe(picked.length);
  });

  it('sem nenhum composto, preenche o total inteiro com isolados', () => {
    const candidates = [row('I1', 'isolado'), row('I2', 'isolado'), row('I3', 'isolado'), row('I4', 'isolado'), row('I5', 'isolado')];
    const picked = pickExercisesForFoco(candidates, { count: 5, compostoCount: 2 });
    expect(picked).toHaveLength(5);
  });

  it('retorna o formato de exercício esperado pelo resto do app (nome/series/reps/descanso/tecnica)', () => {
    const candidates = [{ nome: 'X', tipo: 'composto', series: '4', reps: '8-10', descanso: '90s', tecnica: 'foo' }];
    const [picked] = pickExercisesForFoco(candidates, { count: 1, compostoCount: 1 });
    expect(picked).toEqual({ nome: 'X', series: '4', reps: '8-10', descanso: '90s', tecnica: 'foo' });
  });

  it('cobre todos os grupos do dia, mesmo com um grupo dominando o pool', () => {
    const candidates = [
      ...Array.from({ length: 12 }, (_, i) => row(`Peito${i}`, i < 6 ? 'composto' : 'isolado', 'peito')),
      row('Ombro1', 'isolado', 'ombro'),
      row('Triceps1', 'isolado', 'triceps'),
    ];
    for (let run = 0; run < 20; run++) {
      const picked = pickExercisesForFoco(candidates, { count: 5, compostoCount: 2, grupos: ['peito', 'ombro', 'triceps'] });
      const nomes = picked.map(p => p.nome);
      expect(nomes).toContain('Ombro1');
      expect(nomes).toContain('Triceps1');
      expect(picked).toHaveLength(5);
    }
  });

  it('distribui os compostos entre grupos diferentes antes de repetir um grupo', () => {
    const candidates = [
      row('P1', 'composto', 'peito'), row('P2', 'composto', 'peito'),
      row('C1', 'composto', 'costas'), row('C2', 'composto', 'costas'),
    ];
    const picked = pickExercisesForFoco(candidates, { count: 2, compostoCount: 2, grupos: ['peito', 'costas'] });
    expect(picked.filter(p => p.nome.startsWith('P'))).toHaveLength(1);
    expect(picked.filter(p => p.nome.startsWith('C'))).toHaveLength(1);
  });
});

describe('allowedNiveis', () => {
  it('iniciante só recebe exercícios de nível iniciante', () => {
    expect(allowedNiveis('iniciante')).toEqual(['iniciante']);
  });

  it('avançado recebe todos os níveis', () => {
    expect(allowedNiveis('avancado')).toEqual(['iniciante', 'intermediario', 'avancado']);
  });

  it('nível ausente ou desconhecido conta como intermediário', () => {
    expect(allowedNiveis(undefined)).toEqual(['iniciante', 'intermediario']);
    expect(allowedNiveis('xyz')).toEqual(['iniciante', 'intermediario']);
  });
});

function chainResolving(result, calls = []) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: (col, values) => { calls.push([col, values]); return chain; },
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

describe('withLibraryExercises', () => {
  beforeEach(() => { mockDb.from.mockReset(); });

  const poolDeCandidatos = [
    row('C1', 'composto'), row('C2', 'composto'), row('I1', 'isolado'), row('I2', 'isolado'), row('I3', 'isolado'),
  ];

  it('substitui exercicios de um dia com foco mapeado quando há candidatos suficientes', async () => {
    mockDb.from.mockImplementation(() => chainResolving({ data: poolDeCandidatos, error: null }));

    const days = [{ dia: 'Segunda', foco: 'Peito / Ombro / Tríceps', exercicios: [{ nome: 'Antigo', series: '3', reps: '10', descanso: '60s', tecnica: '' }], pos: [{ nome: 'Pos', series: '-', reps: '-', descanso: '-', tecnica: '' }] }];
    const [result] = await withLibraryExercises(days);

    expect(result.dia).toBe('Segunda');
    expect(result.foco).toBe('Peito / Ombro / Tríceps');
    expect(result.pos).toEqual(days[0].pos); // pos não muda
    expect(result.exercicios).not.toEqual(days[0].exercicios); // exercicios foi substituído
    expect(result.exercicios.length).toBeGreaterThan(0);
  });

  it('mantém o dia igual quando o foco não tem mapeamento (ex.: Descanso Total)', async () => {
    mockDb.from.mockImplementation(() => chainResolving({ data: poolDeCandidatos, error: null }));

    const days = [{ dia: 'Domingo', foco: 'Descanso Total', exercicios: [{ nome: 'Sem treino', series: '-', reps: '-', descanso: '-', tecnica: '' }], pos: [] }];
    const [result] = await withLibraryExercises(days);

    expect(result).toEqual(days[0]);
    expect(mockDb.from).not.toHaveBeenCalled();
  });

  it('mantém o dia igual quando o pool de candidatos é pequeno demais', async () => {
    mockDb.from.mockImplementation(() => chainResolving({ data: [row('C1', 'composto')], error: null }));

    const days = [{ dia: 'Segunda', foco: 'Ombro / Força', exercicios: [{ nome: 'Antigo', series: '3', reps: '10', descanso: '60s', tecnica: '' }], pos: [] }];
    const [result] = await withLibraryExercises(days);

    expect(result).toEqual(days[0]);
  });

  it('mantém o dia igual e não lança erro quando a busca na biblioteca falha', async () => {
    mockDb.from.mockImplementation(() => chainResolving({ data: null, error: new Error('rede indisponível') }));

    const days = [{ dia: 'Segunda', foco: 'Pernas / Quadríceps', exercicios: [{ nome: 'Antigo', series: '3', reps: '10', descanso: '60s', tecnica: '' }], pos: [] }];
    const [result] = await withLibraryExercises(days);

    expect(result).toEqual(days[0]);
  });

  it('busca a biblioteca uma vez só pra semana inteira, filtrando pelo nível', async () => {
    const calls = [];
    mockDb.from.mockImplementation(() => chainResolving({ data: poolDeCandidatos, error: null }, calls));

    const days = [
      { dia: 'Segunda', foco: 'Peito / Tríceps', exercicios: [], pos: [] },
      { dia: 'Terça', foco: 'Costas / Bíceps', exercicios: [], pos: [] },
      { dia: 'Quarta', foco: 'Pernas / Quadríceps', exercicios: [], pos: [] },
    ];
    await withLibraryExercises(days, 'iniciante');

    expect(mockDb.from).toHaveBeenCalledTimes(1);
    expect(calls).toContainEqual(['nivel_minimo', ['iniciante']]);
    const [, grupos] = calls.find(([col]) => col === 'grupo_muscular');
    expect(grupos.sort()).toEqual(['biceps', 'costas', 'peito', 'quadriceps', 'triceps']);
  });

  it('só usa candidatos dos grupos do próprio dia', async () => {
    const pool = [
      row('P1', 'composto', 'peito'), row('P2', 'isolado', 'peito'), row('T1', 'isolado', 'triceps'),
      row('Q1', 'composto', 'quadriceps'), row('Q2', 'isolado', 'quadriceps'),
    ];
    mockDb.from.mockImplementation(() => chainResolving({ data: pool, error: null }));

    const days = [{ dia: 'Segunda', foco: 'Peito / Tríceps', exercicios: [{ nome: 'Antigo', series: '3', reps: '10', descanso: '60s', tecnica: '' }], pos: [] }];
    const [result] = await withLibraryExercises(days, 'intermediario');

    expect(result.exercicios.map(e => e.nome).sort()).toEqual(['P1', 'P2', 'T1']);
  });

  it('cobre todos os focos de treino de força usados nos 6 templates', () => {
    const esperados = [
      'Peito / Ombro / Tríceps', 'Peito / Tríceps', 'Costas / Bíceps', 'Pernas / Quadríceps',
      'Superiores / Força', 'Ombro / Força', 'Posterior / Glúteos', 'Superiores', 'Força / Estabilidade',
    ];
    esperados.forEach(foco => expect(FOCO_TO_GRUPOS[foco]).toBeDefined());
  });
});
