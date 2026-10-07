import { assertEquals } from 'jsr:@std/assert@1';
import { langOf, trExercise, trFoco, trQuando, trVars } from './lang.ts';

Deno.test('langOf: só "en" vira inglês; o resto é português', () => {
  assertEquals(langOf({ lang: 'en' }), 'en');
  assertEquals(langOf({ lang: 'pt' }), 'pt');
  assertEquals(langOf({}), 'pt');
  assertEquals(langOf(null), 'pt');
  assertEquals(langOf({ lang: 'fr' }), 'pt');
});

Deno.test('trExercise: traduz, preserva emoji e cai no original', () => {
  assertEquals(trExercise('en', 'Supino Reto com Barra'), 'Barbell Bench Press');
  assertEquals(trExercise('en', '🔷 Prancha com Peso'), '🔷 Weighted Plank');
  assertEquals(trExercise('en', 'Exercício do personal'), 'Exercício do personal');
  assertEquals(trExercise('pt', 'Supino Reto com Barra'), 'Supino Reto com Barra');
});

Deno.test('trFoco: inteiro, por partes e fallback', () => {
  assertEquals(trFoco('en', 'Peito / Tríceps'), 'Chest / Triceps');
  assertEquals(trFoco('en', 'Descanso Total'), 'Full Rest');
  assertEquals(trFoco('en', 'Foco livre'), 'Foco livre');
  assertEquals(trFoco('pt', 'Peito / Tríceps'), 'Peito / Tríceps');
});

Deno.test('trQuando e trVars', () => {
  assertEquals(trQuando('en', 'hoje'), 'today');
  assertEquals(trQuando('en', 'amanhã'), 'tomorrow');
  assertEquals(trQuando('en', 'em 3 dias'), 'in 3 days');
  assertEquals(trVars('en', { quando: 'hoje', foco: 'Costas / Bíceps', dias: 5 }), { quando: 'today', foco: 'Back / Biceps', dias: 5 });
  assertEquals(trVars('pt', { quando: 'hoje' }), { quando: 'hoje' });
});
