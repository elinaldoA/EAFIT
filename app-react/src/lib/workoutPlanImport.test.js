import { describe, it, expect } from 'vitest';
import { parsePlanLine, parseWorkoutPlanText, planDaysFromTreinos } from './workoutPlanImport';

describe('parsePlanLine', () => {
  it('entende séries x reps escritas de vários jeitos', () => {
    expect(parsePlanLine('Supino reto 4x10')).toEqual(expect.objectContaining({ nome: 'Supino reto', series: '4', reps: '10' }));
    expect(parsePlanLine('Rosca direta 3 séries de 12')).toEqual(expect.objectContaining({ series: '3', reps: '12' }));
    expect(parsePlanLine('Supino reto com barra 4 8-10')).toEqual(expect.objectContaining({ nome: 'Supino reto com barra', series: '4', reps: '8-10' }));
    expect(parsePlanLine('Prancha 3 30-60 segundos')).toEqual(expect.objectContaining({ series: '3', reps: '30-60s' }));
    expect(parsePlanLine('Rosca concentrada 3 12–15 por braço')).toEqual(expect.objectContaining({ reps: '12-15', tecnica: 'Por braço' }));
  });

  it('série ilegível no OCR vira 3; texto corrido não vira exercício', () => {
    expect(parsePlanLine('Remada unilateral com halteres a 10-12 por braço')).toEqual(expect.objectContaining({ nome: 'Remada unilateral com halteres', series: '3', reps: '10-12' }));
    expect(parsePlanLine('Técnicas Avançadas De Treinamento: Você vai aprender a executar as 17')).toBeNull();
    expect(parsePlanLine('para os mais avançados que treinam 6x na semana!')).toBeNull();
    expect(parsePlanLine('Dia A (Peito, Tríceps e Ombros):')).toBeNull();
  });
});

describe('parseWorkoutPlanText', () => {
  // Texto como o OCR devolve a ficha "Treino ABC" (tabela colada como imagem no PDF).
  const ocr = [
    'Treino ABC Intermediário',
    'Dia A (Peito, Tríceps e Ombros):',
    'EXT',
    '1. Supino reto com barra 4 8-10',
    '4, Tríceps na polia 4 10-12',
    'Dia B (Costas e Bíceps):',
    '2. Remada curvada 4 8-10',
    '6. Rosca concentrada E) 12-15 por braço',
    'Dia C (Pernas e Abdômen):',
    '2.Leg press 4 10-12',
    '8. Prancha 3 30-60 segundos',
    'Gostou desse treino e quer um plano completo?',
    'adequam tanto para iniciantes que treinam apenas 3x na semana',
  ].join('\n');

  it('separa os treinos A/B/C com foco e exercícios', () => {
    const { treinos } = parseWorkoutPlanText(ocr);
    expect(treinos.map(t => [t.titulo, t.foco, t.exercicios.length])).toEqual([
      ['A', 'Peito, Tríceps e Ombros', 2], ['B', 'Costas e Bíceps', 2], ['C', 'Pernas e Abdômen', 2],
    ]);
    expect(treinos[2].exercicios.map(e => e.nome)).toEqual(['Leg press', 'Prancha']);
  });

  it('distribui na semana e respeita dia escrito na ficha', () => {
    const days = planDaysFromTreinos(parseWorkoutPlanText(ocr).treinos, 'Descanso');
    expect(days.map(d => d.dia)).toEqual(['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']);
    expect(days.filter(d => d.exercicios.length).map(d => [d.dia, d.foco])).toEqual([
      ['Segunda', 'Treino A — Peito, Tríceps e Ombros'], ['Quarta', 'Treino B — Costas e Bíceps'], ['Sexta', 'Treino C — Pernas e Abdômen'],
    ]);
    expect(days[1]).toEqual({ dia: 'Terça', foco: 'Descanso', exercicios: [], pos: [] });

    const semana = parseWorkoutPlanText('Terça-feira: Superiores\nSupino 4x10\nRemada 4x10\nSábado\nAgachamento 4x8');
    expect(planDaysFromTreinos(semana.treinos, 'Descanso').filter(d => d.exercicios.length).map(d => d.dia)).toEqual(['Terça', 'Sábado']);
  });

  it('sem cabeçalho de dia vira um treino só; sem exercício não é ficha', () => {
    expect(parseWorkoutPlanText('Puxada 3x12\nCrucifixo 3x15').treinos).toHaveLength(1);
    expect(parseWorkoutPlanText('Gostou desse treino?\nClique aqui')).toBeNull();
  });
});
