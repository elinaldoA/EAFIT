import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { renderEmail } from './emailLayout.ts';
import {
  accountDeletedEmail, broadcastEmail, comebackEmail, feedbackReplyEmail, shouldSendWelcome, weeklySummaryEmail, welcomeEmail,
} from './emailTexts.ts';

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

Deno.test('weeklySummaryEmail: números da semana e meta batida ou não', () => {
  const hit = weeklySummaryEmail('pt', 5, 4, 1234);
  assertEquals(hit.heading, 'Meta semanal batida!');
  assertStringIncludes(hit.paragraphs[0], '5 dos 4 treinos');
  assertStringIncludes(hit.paragraphs[0], '1234 kg');
  assertEquals(weeklySummaryEmail('pt', 2, 4, 0).heading, 'Sua semana em números');
  assertEquals(weeklySummaryEmail('en', 2, 4, 0).subject, 'Your week on EAFIT');
  assertEquals(hit.cta?.url, 'https://eafit.com.br/app/#dash');
});

Deno.test('comebackEmail: dias parado, ou primeiro treino pra quem nunca treinou', () => {
  assertStringIncludes(comebackEmail('pt', 9, false).paragraphs[0], 'Já são 9 dias');
  assertStringIncludes(comebackEmail('en', 9, false).paragraphs[0], 'It has been 9 days');
  assertEquals(comebackEmail('pt', 10, true).subject, 'Seu primeiro treino está esperando');
  assertEquals(comebackEmail('en', 10, true).subject, 'Your first workout is waiting');
});

Deno.test('broadcastEmail e feedbackReplyEmail: cada linha vira um parágrafo', () => {
  const b = broadcastEmail('pt', 'Novidade', 'Primeira linha.\n\n  Segunda linha.  \n');
  assertEquals(b.subject, 'Novidade');
  assertEquals(b.paragraphs, ['Primeira linha.', 'Segunda linha.']);
  assertEquals(b.preheader, 'Primeira linha.');
  assertEquals(broadcastEmail('en', 'News', 'x').cta?.label, 'Open the app');

  const r = feedbackReplyEmail('pt', 'Já corrigimos.\nObrigado!');
  assertEquals(r.subject, 'Respondemos o seu feedback');
  assertEquals(r.paragraphs.slice(1), ['Já corrigimos.', 'Obrigado!']);
  assertEquals(feedbackReplyEmail('en', 'ok').subject, 'We replied to your feedback');
});

Deno.test('shouldSendWelcome: só conta nova e ainda não avisada', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  assert(shouldSendWelcome({ created_at: '2026-10-08T11:59:00Z', app_metadata: {} }, now));
  assert(shouldSendWelcome({ created_at: '2026-10-07T12:00:00Z' }, now));
  assert(!shouldSendWelcome({ created_at: '2026-10-07T11:59:00Z', app_metadata: {} }, now));
  assert(!shouldSendWelcome({ created_at: '2026-10-08T11:59:00Z', app_metadata: { welcome_email_at: '2026-10-08T11:59:30Z' } }, now));
  // Cadastrou há dias, confirmou o e-mail agora: ainda recebe.
  assert(shouldSendWelcome({ created_at: '2026-10-01T12:00:00Z', email_confirmed_at: '2026-10-08T11:00:00Z' }, now));
  assert(!shouldSendWelcome({ created_at: '2026-10-01T12:00:00Z', email_confirmed_at: '2026-10-01T12:05:00Z' }, now));
  assert(!shouldSendWelcome({ created_at: null }, now));
  assert(!shouldSendWelcome({ created_at: 'data inválida' }, now));
});
