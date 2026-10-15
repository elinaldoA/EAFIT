import { assertEquals } from 'jsr:@std/assert@1';
import { lookupIp, parseIpinfo, ufFromRegion } from './geoip.ts';

Deno.test('ufFromRegion aceita nome com e sem acento e em inglês', () => {
  assertEquals(ufFromRegion('BR', 'São Paulo'), 'SP');
  assertEquals(ufFromRegion('BR', 'Sao Paulo'), 'SP');
  assertEquals(ufFromRegion('BR', 'State of Rio de Janeiro'), 'RJ');
  assertEquals(ufFromRegion('BR', 'Federal District'), 'DF');
  assertEquals(ufFromRegion('BR', 'Pará'), 'PA');
  assertEquals(ufFromRegion('BR', 'Paraná'), 'PR');
  assertEquals(ufFromRegion('BR', 'Mato Grosso do Sul'), 'MS');
});

Deno.test('ufFromRegion só vale pro Brasil e nome conhecido', () => {
  assertEquals(ufFromRegion('PT', 'Lisboa'), null);
  assertEquals(ufFromRegion('BR', 'Atlantis'), null);
  assertEquals(ufFromRegion('BR', null), null);
});

Deno.test('parseIpinfo lê a resposta do plano completo', () => {
  assertEquals(parseIpinfo({ ip: '1.2.3.4', city: 'Campinas', region: 'São Paulo', country: 'BR' }),
    { country: 'BR', region: 'São Paulo', uf: 'SP', city: 'Campinas' });
});

Deno.test('parseIpinfo lê a resposta do Lite (só país)', () => {
  assertEquals(parseIpinfo({ ip: '1.2.3.4', country_code: 'PT', country: 'Portugal', asn: 'AS1' }),
    { country: 'PT', region: null, uf: null, city: null });
});

Deno.test('parseIpinfo devolve null pra bogon e resposta sem país', () => {
  assertEquals(parseIpinfo({ ip: '10.0.0.1', bogon: true }), null);
  assertEquals(parseIpinfo({ ip: '1.2.3.4' }), null);
  assertEquals(parseIpinfo(null), null);
});

function fakeFetch(responses: Record<string, [number, unknown]>, calls: string[] = []) {
  return (url: string) => {
    calls.push(url);
    const key = Object.keys(responses).find(k => url.startsWith(k));
    const [status, body] = key ? responses[key] : [404, {}];
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
}

Deno.test('lookupIp usa o endpoint completo quando o plano tem estado/cidade', async () => {
  const calls: string[] = [];
  const r = await lookupIp('1.2.3.4', 'tok', fakeFetch({
    'https://ipinfo.io/': [200, { country: 'BR', region: 'Bahia', city: 'Salvador' }],
  }, calls));
  assertEquals(r, { kind: 'ok', geo: { country: 'BR', region: 'Bahia', uf: 'BA', city: 'Salvador' } });
  assertEquals(calls.length, 1);
});

Deno.test('lookupIp cai no /lite quando o token é do plano gratuito', async () => {
  const calls: string[] = [];
  const r = await lookupIp('1.2.3.4', 'tok', fakeFetch({
    'https://ipinfo.io/': [403, { error: 'plan' }],
    'https://api.ipinfo.io/lite/': [200, { country_code: 'BR', country: 'Brazil' }],
  }, calls));
  assertEquals(r, { kind: 'ok', geo: { country: 'BR', region: null, uf: null, city: null } });
  assertEquals(calls.length, 2);
});

Deno.test('lookupIp pede nova tentativa no limite de consultas', async () => {
  assertEquals(await lookupIp('1.2.3.4', undefined, fakeFetch({ 'https://ipinfo.io/': [429, {}] })), { kind: 'retry' });
  assertEquals(await lookupIp('1.2.3.4', 'tok', fakeFetch({
    'https://ipinfo.io/': [403, {}], 'https://api.ipinfo.io/lite/': [429, {}],
  })), { kind: 'retry' });
});

Deno.test('lookupIp sem token marca como não localizado quando não há país', async () => {
  assertEquals(await lookupIp('1.2.3.4', undefined, fakeFetch({ 'https://ipinfo.io/': [200, { bogon: true }] })), { kind: 'not_found' });
});

Deno.test('lookupIp trata falha de rede como nova tentativa', async () => {
  assertEquals(await lookupIp('1.2.3.4', 'tok', () => Promise.reject(new Error('offline'))), { kind: 'retry' });
});
