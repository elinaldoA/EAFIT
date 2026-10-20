import { assertEquals } from 'jsr:@std/assert@1';
import { mapVarRows, personalize, usesVars } from './broadcastVars.ts';

Deno.test('usesVars só reconhece as variáveis dos envios', () => {
  assertEquals(usesVars('Oi {nome}!'), true);
  assertEquals(usesVars('sem nada', 'Você treinou {treinos_mes} dias'), true);
  assertEquals(usesVars('Oi {apelido}', null), false);
  assertEquals(usesVars(undefined, ''), false);
});

Deno.test('personalize troca os valores e limpa o que fica vazio', () => {
  const vars = mapVarRows([
    { bv_user: 'u1', bv_nome: 'Ana', bv_treinos_mes: '4', bv_dias_sem_treinar: 2 },
    { bv_user: 'u2', bv_nome: null, bv_treinos_mes: 0, bv_dias_sem_treinar: null },
  ]);
  assertEquals(personalize('Oi {nome}, {treinos_mes} treinos no mês!', vars.get('u1')), 'Oi Ana, 4 treinos no mês!');
  assertEquals(personalize('Oi {nome}, bora treinar?', vars.get('u2')), 'Oi, bora treinar?');
  assertEquals(personalize('Oi {nome}!', undefined), 'Oi!');
  assertEquals(personalize('Oi {nome}!\n\nBora treinar?', vars.get('u1')), 'Oi Ana!\n\nBora treinar?');
});
