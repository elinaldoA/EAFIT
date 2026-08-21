// Espelha app-react/src/data/workoutTemplates.test.js — mesma lógica, mesmos
// casos, só pra confirmar que o PORT deste arquivo pro Deno se comporta
// igual ao original em JS.
import { assertEquals } from 'jsr:@std/assert@1';
import { applyImcAdjustment, applyLevelAdjustment, computeImcBracket, type Day } from './workoutAdjustments.ts';

Deno.test('computeImcBracket - classifica cada faixa de IMC corretamente', () => {
  assertEquals(computeImcBracket(50, 180), 'abaixo');     // IMC ~15.4
  assertEquals(computeImcBracket(70, 175), 'normal');     // IMC ~22.9
  assertEquals(computeImcBracket(85, 175), 'sobrepeso');  // IMC ~27.8
  assertEquals(computeImcBracket(100, 170), 'obesidade'); // IMC ~34.6
});

Deno.test('computeImcBracket - cai para "normal" quando peso ou altura são inválidos', () => {
  assertEquals(computeImcBracket(0, 180), 'normal');
  assertEquals(computeImcBracket(80, 0), 'normal');
  assertEquals(computeImcBracket(NaN, 180), 'normal');
});

function fixtureDays(): Day[] {
  const treino = (dia: string, foco: string, pos: Day['pos'] = []): Day => ({
    dia, foco,
    exercicios: [{ nome: `Exercício ${dia}`, series: '4', reps: '8-10', descanso: '90s', tecnica: '' }],
    pos,
  });
  return [
    treino('Segunda', 'Peito', [
      { nome: '🔷 Abdominal', series: '3', reps: '15', descanso: '45s', tecnica: '' },
      { nome: '🏃 Cardio — Esteira', series: '-', reps: '20min', descanso: '-', tecnica: '' },
    ]),
    treino('Terça', 'Costas'),
    treino('Quarta', 'Pernas'),
    treino('Quinta', 'Ombro'),
    treino('Sexta', 'Posterior'),
    { dia: 'Sábado', foco: 'Cardio Leve / Recuperação', exercicios: [{ nome: 'Caminhada', series: '-', reps: '30min', descanso: '-', tecnica: '' }], pos: [] },
    { dia: 'Domingo', foco: 'Descanso Total', exercicios: [{ nome: 'Sem treino', series: '-', reps: '-', descanso: '-', tecnica: '' }], pos: [] },
  ];
}

Deno.test('applyImcAdjustment - preserva as 7 entradas (uma por dia) em qualquer faixa', () => {
  for (const bracket of ['abaixo', 'normal', 'sobrepeso', 'obesidade']) {
    assertEquals(applyImcAdjustment(fixtureDays(), bracket).length, 7);
  }
});

Deno.test('applyImcAdjustment - "normal" não altera o conteúdo', () => {
  assertEquals(applyImcAdjustment(fixtureDays(), 'normal'), fixtureDays());
});

Deno.test('applyImcAdjustment - "abaixo" remove o cardio (🏃) dos dias de treino', () => {
  const result = applyImcAdjustment(fixtureDays(), 'abaixo');
  const segunda = result.find(d => d.dia === 'Segunda')!;
  assertEquals(segunda.pos.some(p => p.nome.startsWith('🏃')), false);
});

Deno.test('applyImcAdjustment - "sobrepeso" garante cardio (🏃) nos dias de treino que não têm', () => {
  const result = applyImcAdjustment(fixtureDays(), 'sobrepeso');
  const terca = result.find(d => d.dia === 'Terça')!;
  assertEquals(terca.pos.some(p => p.nome.startsWith('🏃')), true);
});

Deno.test('applyImcAdjustment - "obesidade" rebaixa os 2 últimos dias de treino pra cardio leve e reduz volume dos demais', () => {
  const result = applyImcAdjustment(fixtureDays(), 'obesidade');
  const quinta = result.find(d => d.dia === 'Quinta')!;
  const sexta = result.find(d => d.dia === 'Sexta')!;
  const segunda = result.find(d => d.dia === 'Segunda')!;

  assertEquals(quinta.foco, 'Cardio Leve / Recuperação');
  assertEquals(sexta.foco, 'Cardio Leve / Recuperação');
  assertEquals(segunda.exercicios[0].series, '3'); // 4 - 1
});

function levelFixture(): Day[] {
  return [
    {
      dia: 'Segunda', foco: 'Peito',
      exercicios: [{ nome: 'Supino Reto com Barra', series: '4', reps: '8-10', descanso: '90s', tecnica: 'x' }],
      pos: [{ nome: '🏃 Cardio', series: '-', reps: '20min', descanso: '-', tecnica: '' }],
    },
    { dia: 'Domingo', foco: 'Descanso Total', exercicios: [{ nome: 'Sem treino', series: '-', reps: '-', descanso: '-', tecnica: '' }], pos: [] },
  ];
}

Deno.test('applyLevelAdjustment - não altera nada para "intermediario" (ou nível vazio)', () => {
  assertEquals(applyLevelAdjustment(levelFixture(), 'intermediario'), levelFixture());
  assertEquals(applyLevelAdjustment(levelFixture(), undefined), levelFixture());
});

Deno.test('applyLevelAdjustment - "iniciante" troca por variação guiada, reduz série e aumenta descanso', () => {
  const [segunda] = applyLevelAdjustment(levelFixture(), 'iniciante');
  const ex = segunda.exercicios[0];
  assertEquals(ex.nome, 'Supino Reto na Máquina');
  assertEquals(ex.series, '3'); // 4 - 1
  assertEquals(ex.descanso, '105s'); // 90s + 15s
});

Deno.test('applyLevelAdjustment - "avancado" troca por variação mais exigente, aumenta série e reduz descanso', () => {
  const [segunda] = applyLevelAdjustment(levelFixture(), 'avancado');
  const ex = segunda.exercicios[0];
  assertEquals(ex.nome, 'Supino Reto com Barra (pausa no peito)');
  assertEquals(ex.series, '5'); // 4 + 1
  assertEquals(ex.descanso, '75s'); // 90s - 15s
});

Deno.test('applyLevelAdjustment - não mexe em dias de descanso/cardio nem em itens de cardio (🏃) do pós-treino', () => {
  const [segunda, domingo] = applyLevelAdjustment(levelFixture(), 'avancado');
  assertEquals(segunda.pos, levelFixture()[0].pos);
  assertEquals(domingo, levelFixture()[1]);
});
