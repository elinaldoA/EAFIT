// Espelha app-react/src/data/exerciseLibrary.test.js — mesmos casos principais,
// pra confirmar que o PORT pro Deno se comporta igual ao original em JS.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { allowedNiveis, pickExercisesForFoco, withLibraryExercises, type LibraryClient, type LibraryRow } from './exerciseLibrary.ts';
import type { Day } from './workoutAdjustments.ts';

function row(nome: string, tipo: string, grupo_muscular = 'peito'): LibraryRow {
  return { nome, tipo, grupo_muscular, series: '3', reps: '10-12', descanso: '60s', tecnica: 'x' };
}

function fakeClient(rows: LibraryRow[], calls: Array<[string, unknown]> = []): LibraryClient {
  const query = {
    in(col: string, values: string[]) { calls.push([col, values]); return query; },
    eq() { return query; },
    then(resolve: (v: { data: LibraryRow[]; error: null }) => unknown) {
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    },
  };
  return { from: () => ({ select: () => query }) } as unknown as LibraryClient;
}

Deno.test('allowedNiveis - iniciante só iniciante, avançado todos, desconhecido = intermediário', () => {
  assertEquals(allowedNiveis('iniciante'), ['iniciante']);
  assertEquals(allowedNiveis('avancado'), ['iniciante', 'intermediario', 'avancado']);
  assertEquals(allowedNiveis(undefined), ['iniciante', 'intermediario']);
});

Deno.test('pickExercisesForFoco - cobre todos os grupos do dia sem repetir exercício', () => {
  const candidates = [
    ...Array.from({ length: 12 }, (_, i) => row(`Peito${i}`, i < 6 ? 'composto' : 'isolado', 'peito')),
    row('Ombro1', 'isolado', 'ombro'),
    row('Triceps1', 'isolado', 'triceps'),
  ];
  for (let run = 0; run < 20; run++) {
    const nomes = pickExercisesForFoco(candidates, { count: 5, compostoCount: 2, grupos: ['peito', 'ombro', 'triceps'] }).map(p => p.nome);
    assertEquals(nomes.length, 5);
    assertEquals(new Set(nomes).size, 5);
    assert(nomes.includes('Ombro1'));
    assert(nomes.includes('Triceps1'));
  }
});

Deno.test('withLibraryExercises - uma consulta só, filtrada pelo nível, mantendo pos e dias sem mapeamento', async () => {
  const calls: Array<[string, unknown]> = [];
  const client = fakeClient([row('P1', 'composto'), row('P2', 'isolado'), row('T1', 'isolado', 'triceps')], calls);
  const days: Day[] = [
    { dia: 'Segunda', foco: 'Peito / Tríceps', exercicios: [], pos: [{ nome: 'Pos', series: '-', reps: '-', descanso: '-', tecnica: '' }] },
    { dia: 'Domingo', foco: 'Descanso Total', exercicios: [{ nome: 'Sem treino', series: '-', reps: '-', descanso: '-', tecnica: '' }], pos: [] },
  ];

  const [seg, dom] = await withLibraryExercises(client, days, 'iniciante');

  assertEquals(seg.exercicios.map(e => e.nome).sort(), ['P1', 'P2', 'T1']);
  assertEquals(seg.pos, days[0].pos);
  assertEquals(dom, days[1]);
  assertEquals(calls.find(([col]) => col === 'nivel_minimo')?.[1], ['iniciante']);
});
