import { describe, it, expect } from 'vitest';
import { segmentExercises, findGroup, groupKindLabel, groupRestSeconds, nextInGroup } from './supersets';

const ex = (nome, grupo = null, series = '3', descanso = '60s') => ({ nome, grupo, series, descanso });

describe('segmentExercises', () => {
  it('junta só exercícios seguidos com a mesma letra', () => {
    const segs = segmentExercises([ex('A1', 'A'), ex('A2', 'A'), ex('Solo'), ex('B1', 'B'), ex('B2', 'B'), ex('B3', 'B')]);
    expect(segs.map(s => (s.type === 'group' ? `${s.letter}:${s.members.map(m => m.nome).join('+')}` : s.ex.nome)))
      .toEqual(['A:A1+A2', 'Solo', 'B:B1+B2+B3']);
  });

  it('grupo de um exercício só, letra repetida fora de sequência e item sem séries ficam avulsos', () => {
    const segs = segmentExercises([ex('X', 'A'), ex('Y'), ex('Z', 'A'), ex('Prancha', 'C', '-'), ex('W', 'C')]);
    expect(segs.every(s => s.type === 'single')).toBe(true);
    expect(segs).toHaveLength(5);
  });

  it('aceita letra minúscula e ignora lixo', () => {
    const segs = segmentExercises([ex('a', 'a'), ex('b', ' A '), ex('c', 'AB'), ex('d', 'AB')]);
    expect(segs[0]).toMatchObject({ type: 'group', letter: 'A' });
    expect(segs.slice(1).every(s => s.type === 'single')).toBe(true);
  });
});

describe('rótulos e descanso', () => {
  it('bi-set, tri-set e circuito', () => {
    expect(groupKindLabel(2)).toBe('Bi-set');
    expect(groupKindLabel(3)).toBe('Tri-set');
    expect(groupKindLabel(5)).toBe('Circuito');
  });

  it('descanso do último; sem ele, o maior do grupo', () => {
    expect(groupRestSeconds({ members: [ex('a', 'A', '3', '0s'), ex('b', 'A', '3', '90s')] })).toBe(90);
    expect(groupRestSeconds({ members: [ex('a', 'A', '3', '45s'), ex('b', 'A', '3', '-')] })).toBe(45);
  });
});

describe('nextInGroup', () => {
  const plan = [ex('Supino', 'A', '3', '0s'), ex('Remada', 'A', '3', '90s'), ex('Rosca')];
  const group = findGroup(plan, 'Remada');
  const doneSet = done => (nome, n) => done.has(`${nome}:${n}`);

  it('no meio da volta vai direto para o próximo, sem descanso', () => {
    expect(nextInGroup(group, 'Supino', 1, doneSet(new Set(['Supino:1'])))).toEqual({ rest: false, next: 'Remada' });
  });

  it('ao fechar a volta descansa e volta ao primeiro', () => {
    const done = new Set(['Supino:1', 'Remada:1']);
    expect(nextInGroup(group, 'Remada', 1, doneSet(done))).toEqual({ rest: true, seconds: 90, next: 'Supino' });
  });

  it('última volta: descansa e não há próximo no grupo', () => {
    const all = new Set(['Supino:1', 'Supino:2', 'Supino:3', 'Remada:1', 'Remada:2', 'Remada:3']);
    expect(nextInGroup(group, 'Remada', 3, doneSet(all))).toEqual({ rest: true, seconds: 90, next: null });
  });

  it('séries em quantidades diferentes: quem acabou sai da volta', () => {
    const g = findGroup([ex('A', 'A', '2', '0s'), ex('B', 'A', '3', '60s')], 'A');
    const done = new Set(['A:1', 'A:2', 'B:1', 'B:2']);
    expect(nextInGroup(g, 'B', 2, doneSet(done))).toEqual({ rest: true, seconds: 60, next: 'B' });
  });

  it('pula série já marcada de quem vem depois na volta', () => {
    const g = findGroup([ex('A', 'A'), ex('B', 'A'), ex('C', 'A')], 'A');
    const done = new Set(['A:1', 'B:1']);
    expect(nextInGroup(g, 'A', 1, doneSet(done))).toEqual({ rest: false, next: 'C' });
  });
});
