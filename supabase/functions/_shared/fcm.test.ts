import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  buildFcmMessage, classifyFcmError, fcmTokenOf, isFcmEndpoint, resetFcmTokenCache, sendFcm, signServiceAccountJwt,
} from './fcm.ts';

Deno.test('isFcmEndpoint separa token do app de inscrição web', () => {
  assertEquals(isFcmEndpoint('fcm:abc'), true);
  assertEquals(isFcmEndpoint('https://fcm.googleapis.com/fcm/send/abc'), false);
  assertEquals(fcmTokenOf('fcm:abc:def'), 'abc:def');
});

Deno.test('buildFcmMessage manda título/corpo, dados como string e a tag para substituir o aviso', () => {
  const m = buildFcmMessage('tok', { title: 'T', body: 'B', tag: 'water-1', campaign: 'c1' });
  assertEquals(m.message.token, 'tok');
  assertEquals(m.message.notification, { title: 'T', body: 'B' });
  assertEquals(m.message.data, { tag: 'water-1', campaign: 'c1' });
  assertEquals(m.message.android.notification.tag, 'water-1');
  assertEquals(m.message.android.notification.channel_id, 'eafit_default');
});

Deno.test('buildFcmMessage sem tag nem campanha não manda campos vazios', () => {
  const m = buildFcmMessage('tok', { title: 'T', body: 'B' });
  assertEquals(m.message.data, {});
  assertEquals('tag' in m.message.android.notification, false);
});

Deno.test('classifyFcmError: token inexistente é stale; o resto é erro', () => {
  assertEquals(classifyFcmError(404, {}), 'stale');
  assertEquals(classifyFcmError(400, { error: { details: [{ errorCode: 'UNREGISTERED' }] } }), 'stale');
  assertEquals(classifyFcmError(400, { error: { status: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token' } }), 'stale');
  assertEquals(classifyFcmError(400, { error: { status: 'INVALID_ARGUMENT', message: 'Invalid JSON payload' } }), 'error');
  assertEquals(classifyFcmError(500, {}), 'error');
  assertEquals(classifyFcmError(401, null), 'error');
});

async function makeServiceAccount() {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify'],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  let s = '';
  for (const b of der) s += String.fromCharCode(b);
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(s).replace(/(.{64})/g, '$1\n')}\n-----END PRIVATE KEY-----\n`;
  return {
    sa: { client_email: 'sa@proj.iam.gserviceaccount.com', private_key: pem, project_id: 'proj' },
    publicKey: pair.publicKey,
  };
}

Deno.test('signServiceAccountJwt gera um JWT RS256 verificável com os claims certos', async () => {
  const { sa, publicKey } = await makeServiceAccount();
  const jwt = await signServiceAccountJwt(sa, 1000);
  const [h, c, sig] = jwt.split('.');
  const dec = (x: string) => JSON.parse(atob(x.replace(/-/g, '+').replace(/_/g, '/')));
  assertEquals(dec(h), { alg: 'RS256', typ: 'JWT' });
  const claims = dec(c);
  assertEquals(claims.iss, sa.client_email);
  assertEquals(claims.scope, 'https://www.googleapis.com/auth/firebase.messaging');
  assertEquals(claims.exp - claims.iat, 3600);
  const raw = atob(sig.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
  assert(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, bytes, new TextEncoder().encode(`${h}.${c}`)));
});

Deno.test('sendFcm troca o JWT por token, envia e reaproveita o token na segunda chamada', async () => {
  const { sa } = await makeServiceAccount();
  resetFcmTokenCache();
  const calls: string[] = [];
  const fakeFetch = ((url: string, init: RequestInit) => {
    calls.push(String(url));
    if (String(url).includes('oauth2')) {
      return Promise.resolve(new Response(JSON.stringify({ access_token: 'at', expires_in: 3600 })));
    }
    assertEquals((init.headers as Record<string, string>).Authorization, 'Bearer at');
    return Promise.resolve(new Response(JSON.stringify({ name: 'm' })));
  }) as unknown as typeof fetch;

  assertEquals(await sendFcm('fcm:tok', { title: 'T', body: 'B' }, fakeFetch, sa), 'sent');
  assertEquals(await sendFcm('fcm:tok', { title: 'T', body: 'B' }, fakeFetch, sa), 'sent');
  assertEquals(calls.filter((u) => u.includes('oauth2')).length, 1);
  assertEquals(calls.filter((u) => u.includes('/projects/proj/messages:send')).length, 2);
});

Deno.test('sendFcm devolve stale para token desregistrado e error sem o secret', async () => {
  const { sa } = await makeServiceAccount();
  resetFcmTokenCache();
  const fakeFetch = ((url: string) => String(url).includes('oauth2')
    ? Promise.resolve(new Response(JSON.stringify({ access_token: 'at', expires_in: 3600 })))
    : Promise.resolve(new Response(JSON.stringify({ error: { status: 'NOT_FOUND' } }), { status: 404 }))) as unknown as typeof fetch;
  assertEquals(await sendFcm('fcm:gone', { title: 'T', body: 'B' }, fakeFetch, sa), 'stale');
  assertEquals(await sendFcm('fcm:tok', { title: 'T', body: 'B' }, fakeFetch, null), 'error');
});
