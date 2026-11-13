import { assertEquals } from 'jsr:@std/assert@1';
import { activationStepFor } from './activation.ts';

Deno.test('activationStepFor: passo 1 no 2º dia, passo 2 no 5º, nenhum nos outros', () => {
  assertEquals(activationStepFor('2026-11-10', '2026-11-10'), null);
  assertEquals(activationStepFor('2026-11-10', '2026-11-11'), null);
  assertEquals(activationStepFor('2026-11-10', '2026-11-12'), 1);
  assertEquals(activationStepFor('2026-11-10', '2026-11-13'), null);
  assertEquals(activationStepFor('2026-11-10', '2026-11-15'), 2);
  assertEquals(activationStepFor('2026-11-10', '2026-11-17'), null);
});

Deno.test('activationStepFor: atravessa a virada de mês e de ano', () => {
  assertEquals(activationStepFor('2026-10-30', '2026-11-01'), 1);
  assertEquals(activationStepFor('2026-12-29', '2027-01-03'), 2);
});
