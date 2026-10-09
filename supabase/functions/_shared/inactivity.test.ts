import { assert, assertEquals } from 'jsr:@std/assert@1';
import { unsubscribeToken, verifyUnsubscribeToken } from './emailPrefs.ts';
import {
  cleanComment, COMMENT_MAX, INACTIVITY_REASONS, isInactivityReason, reasonLabel, surveyLink, surveyToken, verifySurveyToken,
} from './inactivity.ts';

Deno.test('isInactivityReason e reasonLabel: só os motivos da lista, com texto em pt e en', () => {
  assert(isInactivityReason('sem_tempo'));
  for (const bad of ['', 'preguica', null, 3, undefined]) assert(!isInactivityReason(bad));
  for (const reason of INACTIVITY_REASONS) {
    assert(reasonLabel('pt', reason));
    assert(reasonLabel('en', reason));
  }
  assertEquals(reasonLabel('pt', 'saude'), 'Lesão ou questão de saúde');
});

Deno.test('código da pesquisa: vale só pra conta e não serve como descadastro (nem o contrário)', async () => {
  const id = '11111111-2222-3333-4444-555555555555';
  const token = await surveyToken(id, 'chave');
  assertEquals(await verifySurveyToken(token, 'chave'), id);
  assertEquals(await verifySurveyToken(token, 'outra-chave'), null);
  assertEquals(await verifyUnsubscribeToken(token, 'chave'), null);
  assertEquals(await verifySurveyToken(await unsubscribeToken(id, 'chave'), 'chave'), null);
});

Deno.test('surveyLink: abre o app com o motivo e o código', () => {
  assertEquals(surveyLink('id.abc', 'outro_app'), 'https://eafit.com.br/app/?motivo=outro_app&r=id.abc');
});

Deno.test('cleanComment: apara, corta no limite e vazio vira null', () => {
  assertEquals(cleanComment('  treino longo demais  '), 'treino longo demais');
  assertEquals(cleanComment('   '), null);
  assertEquals(cleanComment(undefined), null);
  assertEquals(cleanComment(42), null);
  assertEquals(cleanComment('x'.repeat(COMMENT_MAX + 50))?.length, COMMENT_MAX);
});
