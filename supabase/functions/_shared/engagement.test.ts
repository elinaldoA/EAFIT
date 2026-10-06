import { assertEquals } from 'jsr:@std/assert@1';
import { isRuleDue, nowInSaoPaulo, renderTemplate } from './engagement.ts';

Deno.test('nowInSaoPaulo converte de UTC para Brasília (UTC-3)', () => {
  // 2026-10-07 02:30 UTC = 2026-10-06 23:30 em Brasília (terça-feira)
  const r = nowInSaoPaulo(new Date('2026-10-07T02:30:00Z'));
  assertEquals(r, { date: '2026-10-06', hour: 23, dow: 2 });
});

Deno.test('nowInSaoPaulo: meia-noite local vira hora 0, não 24', () => {
  // 2026-10-06 03:00 UTC = 2026-10-06 00:00 em Brasília
  assertEquals(nowInSaoPaulo(new Date('2026-10-06T03:00:00Z')).hour, 0);
});

Deno.test('isRuleDue exige a hora exata', () => {
  assertEquals(isRuleDue({ send_hour: 9, weekdays: null }, 9, 3), true);
  assertEquals(isRuleDue({ send_hour: 9, weekdays: null }, 10, 3), false);
});

Deno.test('isRuleDue respeita o filtro de dias da semana', () => {
  assertEquals(isRuleDue({ send_hour: 18, weekdays: [4, 5] }, 18, 4), true);
  assertEquals(isRuleDue({ send_hour: 18, weekdays: [4, 5] }, 18, 1), false);
  assertEquals(isRuleDue({ send_hour: 18, weekdays: [] }, 18, 1), true);
});

Deno.test('renderTemplate substitui placeholders', () => {
  assertEquals(
    renderTemplate('{nome}, faltam {faltam} treino(s)', { nome: 'Ana', faltam: 2 }),
    'Ana, faltam 2 treino(s)',
  );
});

Deno.test('renderTemplate limpa placeholder sem valor', () => {
  assertEquals(renderTemplate('Oi {nome}, bora?', {}), 'Oi, bora?');
  assertEquals(renderTemplate('Hoje é dia de {foco}', { foco: null }), 'Hoje é dia de');
});
