import { assertEquals } from 'jsr:@std/assert@1';
import { isRunner, sportOf, weeklyKmGoal } from './sport.ts';

Deno.test('sportOf: só corrida é outro esporte; o resto é musculação', () => {
  assertEquals(sportOf({ esporte: 'corrida' }), 'corrida');
  assertEquals(sportOf({ esporte: 'musculacao' }), 'musculacao');
  assertEquals(sportOf({ esporte: 'natacao' }), 'musculacao');
  assertEquals(sportOf({}), 'musculacao');
  assertEquals(sportOf(null), 'musculacao');
  assertEquals(sportOf(undefined), 'musculacao');
  assertEquals(sportOf('corrida'), 'musculacao');
});

Deno.test('isRunner', () => {
  assertEquals(isRunner({ esporte: 'corrida', nome: 'Ana' }), true);
  assertEquals(isRunner({ nome: 'Ana' }), false);
});

Deno.test('weeklyKmGoal: número de 1 a 300, o resto é sem meta', () => {
  assertEquals(weeklyKmGoal({ runWeeklyKm: 25 }), 25);
  assertEquals(weeklyKmGoal({ runWeeklyKm: 12.5 }), 12.5);
  assertEquals(weeklyKmGoal({ runWeeklyKm: '30' }), 30);
  assertEquals(weeklyKmGoal({ runWeeklyKm: '15,5' }), 15.5);
  assertEquals(weeklyKmGoal({ runWeeklyKm: 0 }), null);
  assertEquals(weeklyKmGoal({ runWeeklyKm: 301 }), null);
  assertEquals(weeklyKmGoal({ runWeeklyKm: 'abc' }), null);
  assertEquals(weeklyKmGoal({ runWeeklyKm: null }), null);
  assertEquals(weeklyKmGoal({}), null);
  assertEquals(weeklyKmGoal(undefined), null);
});
