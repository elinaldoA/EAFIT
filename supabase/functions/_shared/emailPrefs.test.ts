import { assert, assertEquals } from 'jsr:@std/assert@1';
import { emailOptedIn, unsubscribeLinks, unsubscribeToken, verifyUnsubscribeToken } from './emailPrefs.ts';

Deno.test('emailOptedIn: ligado por padrão, só false desliga', () => {
  assert(emailOptedIn({}));
  assert(emailOptedIn(null));
  assert(emailOptedIn({ notifyEmail: true }));
  assert(!emailOptedIn({ notifyEmail: false }));
});

Deno.test('código de descadastro: vale só pro usuário e pra chave que assinou', async () => {
  const id = '11111111-2222-3333-4444-555555555555';
  const token = await unsubscribeToken(id, 'chave');
  assertEquals(await verifyUnsubscribeToken(token, 'chave'), id);
  assertEquals(await verifyUnsubscribeToken(token, 'outra-chave'), null);

  // Trocar o id mantendo a assinatura não vale.
  const forged = `99999999-2222-3333-4444-555555555555.${token.split('.')[1]}`;
  assertEquals(await verifyUnsubscribeToken(forged, 'chave'), null);

  for (const bad of [null, 42, '', 'sem-ponto', '.abc', `${id}.`, `${id}.abc`]) {
    assertEquals(await verifyUnsubscribeToken(bad, 'chave'), null);
  }
});

Deno.test('unsubscribeLinks: página do app e endereço de um clique', () => {
  const links = unsubscribeLinks('id.abc', 'https://x.supabase.co');
  assertEquals(links.page, 'https://eafit.com.br/app/?descadastro=id.abc');
  assertEquals(links.oneClick, 'https://x.supabase.co/functions/v1/email-unsubscribe?t=id.abc');
});
