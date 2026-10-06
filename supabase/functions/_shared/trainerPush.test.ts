import { assertEquals } from 'jsr:@std/assert@1';
import { pickRecipients, previewText } from './trainerPush.ts';

Deno.test('previewText achata espaços e corta com reticências', () => {
  assertEquals(previewText('  oi\n\n  tudo   bem? '), 'oi tudo bem?');
  assertEquals(previewText('a'.repeat(200), 10), 'aaaaaaaaa…');
});

Deno.test('pickRecipients só aceita alunos ativos do personal', () => {
  const active = ['a', 'b', 'c'];
  assertEquals(pickRecipients(['a', 'x', 'c', 'a', 7], active), ['a', 'c']);
});

Deno.test('pickRecipients sem lista pedida usa todos os ativos', () => {
  assertEquals(pickRecipients(undefined, ['a', 'b']), ['a', 'b']);
  assertEquals(pickRecipients([], ['a', 'b']), ['a', 'b']);
  assertEquals(pickRecipients(['z'], ['a', 'b']), []);
});
