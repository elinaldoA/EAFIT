import { assertEquals } from 'jsr:@std/assert@1';
import { defaultMessageTitle, pickRecipients, previewText, replyTitle } from './trainerPush.ts';

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

Deno.test('títulos por idioma', () => {
  assertEquals(replyTitle('Ana'), 'Resposta de Ana');
  assertEquals(replyTitle('Ana', 'en'), 'Reply from Ana');
  assertEquals(defaultMessageTitle(), 'Recado do seu personal');
  assertEquals(defaultMessageTitle('en'), 'Message from your trainer');
});
