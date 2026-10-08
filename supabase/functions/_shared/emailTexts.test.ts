import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { renderEmail } from './emailLayout.ts';
import { accountDeletedEmail, shouldSendWelcome, welcomeEmail } from './emailTexts.ts';

Deno.test('welcomeEmail: pt e en, com botão pro app', () => {
  assertEquals(welcomeEmail('pt').subject, 'Boas-vindas ao EAFIT');
  assertEquals(welcomeEmail('en').subject, 'Welcome to EAFIT');
  assertEquals(welcomeEmail('pt').cta?.url, 'https://eafit.com.br/app/');
  assertEquals(welcomeEmail('en').cta?.label, 'Open the app');
});

Deno.test('accountDeletedEmail: sem botão (a conta não existe mais)', () => {
  assertEquals(accountDeletedEmail('pt').subject, 'Sua conta no EAFIT foi excluída');
  assertEquals(accountDeletedEmail('en').subject, 'Your EAFIT account was deleted');
  assertEquals(accountDeletedEmail('pt').cta, undefined);
  const { html, text } = renderEmail('pt', accountDeletedEmail('pt'));
  assertStringIncludes(html, 'porque tinha uma conta no EAFIT');
  assert(!text.includes('porque tem uma conta'));
});

Deno.test('shouldSendWelcome: só conta nova e ainda não avisada', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  assert(shouldSendWelcome({ created_at: '2026-10-08T11:59:00Z', app_metadata: {} }, now));
  assert(shouldSendWelcome({ created_at: '2026-10-07T12:00:00Z' }, now));
  assert(!shouldSendWelcome({ created_at: '2026-10-07T11:59:00Z', app_metadata: {} }, now));
  assert(!shouldSendWelcome({ created_at: '2026-10-08T11:59:00Z', app_metadata: { welcome_email_at: '2026-10-08T11:59:30Z' } }, now));
  assert(!shouldSendWelcome({ created_at: null }, now));
  assert(!shouldSendWelcome({ created_at: 'data inválida' }, now));
});
