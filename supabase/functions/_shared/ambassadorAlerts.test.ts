import { assertEquals } from 'jsr:@std/assert@1';
import { alertsKind, buildSignupPush, crossedMilestone, signupTag } from './ambassadorAlerts.ts';

Deno.test('embaixador e influenciador recebem aviso', () => {
  assertEquals(alertsKind('influenciador'), true);
  assertEquals(alertsKind('embaixador'), true);
  assertEquals(alertsKind('outro'), false);
});

Deno.test('tag abre o modo do programa', () => {
  assertEquals(signupTag('2026-10-20', 9), 'program-signups-2026-10-20-9');
});

Deno.test('marco batido na rodada (o maior, se passou de vários)', () => {
  assertEquals(crossedMilestone(1, 1), 1);
  assertEquals(crossedMilestone(2, 11), 10);
  assertEquals(crossedMilestone(30, 30), 25);
  assertEquals(crossedMilestone(1, 7), null);
  assertEquals(crossedMilestone(3, 10), 10);
});

Deno.test('aviso comemora a meta, no modo de cada um', () => {
  assertEquals(buildSignupPush({ kind: 'influenciador', fresh: 1, total: 1 }).title, '🏆 Seu primeiro cadastro!');
  assertEquals(buildSignupPush({ kind: 'embaixador', fresh: 2, total: 10 }), {
    title: '🏆 Meta batida: 10 cadastros!',
    body: '2 contas novas pelo seu link, 10 no total. Veja seus selos no modo Embaixador.',
  });
  assertEquals(buildSignupPush({ kind: 'influenciador', fresh: 1, total: 25 }, 'en').title, '🏆 Goal reached: 25 sign-ups!');
});

Deno.test('uma conta nova: singular, com o total', () => {
  assertEquals(buildSignupPush({ kind: 'influenciador', fresh: 1, total: 7 }), {
    title: '🎉 Nova conta pelo seu link',
    body: 'Já são 7 no total. Veja os números no modo Influenciador.',
  });
  assertEquals(buildSignupPush({ kind: 'embaixador', fresh: 1, total: 7 }).body, 'Já são 7 no total. Veja os números no modo Embaixador.');
});

Deno.test('várias contas novas', () => {
  assertEquals(buildSignupPush({ kind: 'embaixador', fresh: 3, total: 13 }).title, '🎉 3 novas contas pelo seu link');
});

Deno.test('inglês', () => {
  assertEquals(buildSignupPush({ kind: 'influenciador', fresh: 2, total: 8 }, 'en'), {
    title: '🎉 2 new sign-ups from your link',
    body: "That's 8 in total. See the numbers in Influencer mode.",
  });
  assertEquals(buildSignupPush({ kind: 'embaixador', fresh: 1, total: 4 }, 'en').body, "That's 4 in total. See the numbers in Ambassador mode.");
});
