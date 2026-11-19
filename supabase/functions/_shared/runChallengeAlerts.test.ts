import { assertEquals } from 'jsr:@std/assert@1';
import { buildRunChallengePush, isKnownAlert, runChallengeTag } from './runChallengeAlerts.ts';

Deno.test('só os dois tipos conhecidos viram aviso', () => {
  assertEquals(isKnownAlert('new'), true);
  assertEquals(isKnownAlert('pass'), true);
  assertEquals(isKnownAlert('outro'), false);
});

Deno.test('tag leva à aba Desafios, uma por desafio e dia', () => {
  assertEquals(runChallengeTag('new', 'abc', '2026-12-01'), 'run-challenge-new-abc-2026-12-01');
});

Deno.test('desafio novo, em português e inglês', () => {
  const a = { kind: 'new', title: '100 km em dezembro', rank: null };
  assertEquals(buildRunChallengePush(a).title, '🏆 Novo desafio no EAFIT Run');
  assertEquals(buildRunChallengePush(a).body.startsWith('100 km em dezembro'), true);
  assertEquals(buildRunChallengePush(a, 'en').title, '🏆 New challenge on EAFIT Run');
});

Deno.test('ultrapassagem diz a nova posição', () => {
  const a = { kind: 'pass', title: '100 km em dezembro', rank: 4 };
  assertEquals(buildRunChallengePush(a).body, 'Você caiu para o 4º lugar em "100 km em dezembro". Uma corrida e você volta!');
  assertEquals(buildRunChallengePush(a, 'en').body, "You dropped to #4 in \"100 km em dezembro\". One run and you're back on top!");
});

Deno.test('título enorme não estoura o limite do push', () => {
  const a = { kind: 'pass', title: 'x'.repeat(500), rank: 2 };
  assertEquals(buildRunChallengePush(a).body.length <= 200, true);
});
