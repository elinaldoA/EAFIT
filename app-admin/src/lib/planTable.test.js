import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));
import { parsePlanTable, parseDelimited } from './planTable';
import { planFromText } from './workoutPlanFile';

const CSV = [
  'Grupo;Exercício;Séries;Reps;Descanso;Observação',
  'Peito;Supino reto com barra;4;8-10;90s;Controle a descida',
  'Peito;Crucifixo;3;12;60s;',
  'Costas;Remada curvada;4;10;90s;',
].join('\n');

describe('planTable', () => {
  it('lê da coluna Exercício em diante e ignora o que vem antes', () => {
    const { treinos } = parsePlanTable(parseDelimited(CSV));
    const ex = treinos.flatMap(t => t.exercicios);
    expect(ex).toHaveLength(3);
    expect(ex[0]).toEqual({ nome: 'Supino reto com barra', series: '4', reps: '8-10', descanso: '90s', tecnica: 'Controle a descida' });
  });

  it('agrupa por coluna Dia/Treino e por linhas de título', () => {
    const byCol = parsePlanTable([['Treino', 'Exercício', 'Séries', 'Reps'], ['A', 'Supino', '4', '10'], ['B', 'Remada', '3', '12']]);
    expect(byCol.treinos.map(t => t.titulo)).toEqual(['A', 'B']);
    const byTitle = parsePlanTable([['Exercício', 'Séries', 'Reps'], ['Treino A - Peito'], ['Supino', '4', '10'], ['Segunda'], ['Remada', '3', '12']]);
    expect(byTitle.treinos[0]).toMatchObject({ titulo: 'A', foco: 'Peito' });
    expect(byTitle.treinos[1].dia).toBe('Segunda');
  });

  it('aceita "4x10" numa coluna só, aspas no CSV e devolve null sem cabeçalho', () => {
    const t = parsePlanTable(parseDelimited('Exercício,Séries\n"Supino, reto",4x10'));
    expect(t.treinos[0].exercicios[0]).toMatchObject({ nome: 'Supino, reto', series: '4', reps: '10' });
    expect(parsePlanTable([['a', 'b'], ['c', 'd']])).toBeNull();
  });

  it('planFromText usa a tabela (CSV com ; e colunas antes do exercício)', () => {
    const res = planFromText(CSV, 'ficha');
    const ex = res.plan.days.flatMap(d => d.exercicios);
    expect(ex.map(e => e.reps)).toEqual(['8-10', '12', '10']);
    expect(ex[0].descanso).toBe('90s');
  });
});
