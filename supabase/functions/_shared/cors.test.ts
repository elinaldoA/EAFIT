import { assertEquals } from 'jsr:@std/assert@1';
import { corsHeadersFor } from './cors.ts';

function reqWithOrigin(origin: string | null) {
  const headers = new Headers();
  if (origin) headers.set('origin', origin);
  return new Request('https://example.com/fn', { headers });
}

Deno.test('corsHeadersFor ecoa a origem quando está na allowlist (produção)', () => {
  const headers = corsHeadersFor(reqWithOrigin('https://elinaldoa.github.io'));
  assertEquals(headers['Access-Control-Allow-Origin'], 'https://elinaldoa.github.io');
});

Deno.test('corsHeadersFor ecoa localhost de dev do app-react e do app-admin', () => {
  assertEquals(corsHeadersFor(reqWithOrigin('http://localhost:5173'))['Access-Control-Allow-Origin'], 'http://localhost:5173');
  assertEquals(corsHeadersFor(reqWithOrigin('http://localhost:5174'))['Access-Control-Allow-Origin'], 'http://localhost:5174');
});

Deno.test('corsHeadersFor cai pro domínio de produção quando a origem não está na allowlist', () => {
  const headers = corsHeadersFor(reqWithOrigin('https://site-nao-autorizado.com'));
  assertEquals(headers['Access-Control-Allow-Origin'], 'https://elinaldoa.github.io');
});

Deno.test('corsHeadersFor cai pro domínio de produção quando não há header Origin', () => {
  const headers = corsHeadersFor(reqWithOrigin(null));
  assertEquals(headers['Access-Control-Allow-Origin'], 'https://elinaldoa.github.io');
});
