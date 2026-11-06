import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { renderEmail } from './emailLayout.ts';
import {
  accountDeletedEmail, broadcastEmail, comebackEmail, feedbackReplyEmail, firstNameOf, inactivityEmail, runWeeklySummaryEmail, shouldSendWelcome, weeklyExtrasLine,
  weeklySummaryEmail, welcomeEmail,
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

Deno.test('welcomeEmail: só musculação (o módulo de corrida ainda não é público)', () => {
  const pt = welcomeEmail('pt', 'Ana');
  assertStringIncludes(pt.paragraphs.join(' '), 'plano de treino');
  assertEquals(/corr(ida|er)/i.test(pt.paragraphs.join(' ') + (pt.footnote ?? '')), false);
  assertEquals(/run/i.test(welcomeEmail('en').paragraphs.join(' ')), false);
});

Deno.test('welcomeEmail: quem é da corrida recebe só texto de corrida', () => {
  const pt = welcomeEmail('pt', 'Ana', 'corrida');
  assertStringIncludes(pt.paragraphs.join(' '), 'corridas com GPS');
  assertEquals(/muscula|carga|água|treino/i.test(pt.paragraphs.join(' ') + (pt.footnote ?? '')), false);
});

Deno.test('runWeeklySummaryEmail: km, corridas, comparação e meta', () => {
  const up = runWeeklySummaryEmail('pt', 12300, 2, 10000, null);
  assertEquals(up.subject, 'Sua semana de corrida no EAFIT');
  assertStringIncludes(up.paragraphs[0], '12,3 km em 2 corridas');
  assertStringIncludes(up.paragraphs[1], '23% a mais');
  assertEquals(up.cta?.url, 'https://eafit.com.br/app/#inicio');

  const down = runWeeklySummaryEmail('pt', 5000, 1, 10000, 20);
  assertStringIncludes(down.paragraphs[0], '5,0 km em 1 corrida.');
  assertStringIncludes(down.paragraphs[1], '50% a menos');
  assertStringIncludes(down.paragraphs[2], 'faltaram 15,0 km');

  const hit = runWeeklySummaryEmail('en', 21500, 3, 0, 20);
  assertEquals(hit.subject, 'Weekly goal hit! Your running week on EAFIT');
  assertStringIncludes(hit.paragraphs[0], '21.5 km in 3 runs');
  assertEquals(hit.paragraphs.length, 3); // sem comparação quando não havia semana anterior
  assertStringIncludes(hit.paragraphs[1], 'You hit your goal of 20.0 km');

  const named = runWeeklySummaryEmail('pt', 3000, 1, 3000, null, 'Bia');
  assertEquals(named.paragraphs[0], 'Oi, Bia!');
  assertStringIncludes(named.paragraphs[2], 'mesmo da semana anterior');
});

Deno.test('comebackEmail: dias parado, ou primeiro treino pra quem nunca treinou', () => {
  assertStringIncludes(comebackEmail('pt', 9, false).paragraphs[0], 'Já são 9 dias');
  assertStringIncludes(comebackEmail('en', 9, false).paragraphs[0], 'It has been 9 days');
  assertEquals(comebackEmail('pt', 10, true).subject, 'Seu primeiro treino está esperando');
  assertEquals(comebackEmail('en', 10, true).subject, 'Your first workout is waiting');
});

Deno.test('inactivityEmail: texto por segmento e um link por motivo', () => {
  const link = (reason: string) => `https://x/?motivo=${reason}`;
  const absent = inactivityEmail('pt', { segment: 'absent', days: 41, neverTrained: false }, link);
  assertEquals(absent.subject, 'O que fez você parar?');
  assertStringIncludes(absent.paragraphs[0], 'Já são 41 dias');
  assertEquals(absent.choices?.length, 7);
  assertEquals(absent.choices?.[0], { label: 'Estou sem tempo', url: 'https://x/?motivo=sem_tempo' });

  const idle = inactivityEmail('pt', { segment: 'idle', days: 41, neverTrained: false }, link);
  assertEquals(idle.subject, 'O que está travando o seu treino?');
  assertStringIncludes(idle.paragraphs[0], 'Você abriu o EAFIT recentemente');
  assertStringIncludes(inactivityEmail('pt', { segment: 'idle', days: 41, neverTrained: true }, link).paragraphs[0], 'ainda não registrou nenhum treino');
  assertStringIncludes(inactivityEmail('pt', { segment: 'absent', days: 41, neverTrained: true }, link).paragraphs[0], 'primeiro treino');

  const en = inactivityEmail('en', { segment: 'absent', days: 41, neverTrained: false }, link);
  assertEquals(en.subject, 'What made you stop?');
  assertEquals(en.choices?.[0].label, 'I have no time');
  assertEquals(inactivityEmail('en', { segment: 'idle', days: 41, neverTrained: false }, link).subject, 'What is keeping you from training?');
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

Deno.test('weeklyExtrasLine: calorias entram só com dias registrados', () => {
  assertEquals(
    weeklyExtrasLine('pt', { kcalDays: 4, kcalAvg: 2049.6 }),
    'Além disso: suas calorias ficaram em média 2050 kcal por dia em 4 dias.',
  );
  assertEquals(
    weeklyExtrasLine('en', { kcalDays: 1, kcalAvg: 1800, weightDelta: 0 }),
    'Also: your calories averaged 1800 kcal a day over 1 day and your weight held steady.',
  );
  assertEquals(weeklyExtrasLine('pt', { kcalDays: 0, kcalAvg: 0 }), null);
});

Deno.test('weeklySummaryEmail: linha extra de proteína e peso só quando há dados', () => {
  assertEquals(weeklySummaryEmail('pt', 3, 4, 100).paragraphs.length, 2);
  const pt = weeklySummaryEmail('pt', 3, 4, 100, { proteinDays: 5, proteinAvg: 118.6, weightDelta: -0.84 });
  assertEquals(pt.paragraphs[1], 'Além disso: você registrou proteína em 5 dias, com média de 119 g e seu peso caiu 0,8 kg.');
  const en = weeklySummaryEmail('en', 3, 4, 100, { proteinDays: 1, proteinAvg: 90, weightDelta: 0 });
  assertEquals(en.paragraphs[1], 'Also: you logged protein on 1 day, averaging 90 g and your weight held steady.');
});

Deno.test('firstNameOf pega o primeiro nome com inicial maiúscula', () => {
  assertEquals(firstNameOf({ nome: '  maria da silva ' }), 'Maria');
  assertEquals(firstNameOf({ apelido: 'Zé' }), 'Zé');
  assertEquals(firstNameOf({}), '');
  assertEquals(firstNameOf(null), '');
});

Deno.test('e-mails chamam a pessoa pelo nome quando ele é conhecido', () => {
  const w = welcomeEmail('pt', 'Maria');
  assertEquals(w.subject, 'Boas-vindas ao EAFIT, Maria!');
  assertEquals(w.paragraphs[0], 'Oi, Maria!');
  assertEquals(welcomeEmail('en', 'Maria').paragraphs[0], 'Hi Maria!');
  assertEquals(comebackEmail('pt', 9, false, 'Maria').subject, 'Maria, sentimos sua falta no EAFIT');
  assertEquals(weeklySummaryEmail('pt', 3, 4, 100, {}, 'Maria').paragraphs[0], 'Oi, Maria!');
  assertEquals(feedbackReplyEmail('pt', 'ok', 'Maria').paragraphs[0], 'Oi, Maria!');
});
