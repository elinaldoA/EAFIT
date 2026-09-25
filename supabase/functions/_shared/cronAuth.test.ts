import { assertEquals } from 'jsr:@std/assert@1';
import { isAuthorizedCronRequest, CRON_SECRET_HEADER } from './cronAuth.ts';

function reqWithSecret(secret: string | null) {
  const headers = new Headers();
  if (secret !== null) headers.set(CRON_SECRET_HEADER, secret);
  return new Request('https://example.com/fn', { method: 'POST', headers });
}

Deno.test('isAuthorizedCronRequest aceita o segredo certo', () => {
  assertEquals(isAuthorizedCronRequest(reqWithSecret('abc123'), 'abc123'), true);
});

Deno.test('isAuthorizedCronRequest recusa segredo errado ou ausente', () => {
  assertEquals(isAuthorizedCronRequest(reqWithSecret('errado'), 'abc123'), false);
  assertEquals(isAuthorizedCronRequest(reqWithSecret(null), 'abc123'), false);
});

Deno.test('isAuthorizedCronRequest recusa tudo quando CRON_SECRET não está configurado', () => {
  assertEquals(isAuthorizedCronRequest(reqWithSecret(''), undefined), false);
  assertEquals(isAuthorizedCronRequest(reqWithSecret('qualquer'), ''), false);
});
