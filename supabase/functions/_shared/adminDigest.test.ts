import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { type AlertRow, type DigestMetrics, alertEmail, digestEmail, dueAlerts, isDigestTime, trend } from './adminDigest.ts';

const METRICS: DigestMetrics = {
  signups: 12, signups_prev: 9, trained: 40, trained_prev: 44, workouts: 120, workouts_prev: 120,
  errors: 3, errors_prev: 0, new_errors: [{ message: 'TypeError x', n: 2 }], support_open: 4, support_late: 1,
  nps: 42, nps_answers: 10, risk_high: 7, partners: [{ name: 'Ana', kind: 'influenciador', n: 5 }],
};

Deno.test('trend mostra a diferença e o % contra a semana anterior', () => {
  assertEquals(trend(12, 9), '12 (+3 / +33%)');
  assertEquals(trend(40, 44), '40 (-4 / -9%)');
  assertEquals(trend(3, 0), '3 (+3)');
});

Deno.test('relatório sai só às 8h de segunda', () => {
  assertEquals(isDigestTime(8, 1), true);
  assertEquals(isDigestTime(9, 1), false);
  assertEquals(isDigestTime(8, 2), false);
});

Deno.test('digestEmail traz os números, erros novos e parceiros', () => {
  const e = digestEmail(METRICS);
  assertStringIncludes(e.subject, '12 cadastro(s), 40 treinando');
  const text = e.paragraphs.join('\n');
  assertStringIncludes(text, 'Cadastros: 12 (+3 / +33%)');
  assertStringIncludes(text, 'NPS da semana: 42 (10 resposta(s))');
  assertStringIncludes(text, '“TypeError x” (2×)');
  assertStringIncludes(text, 'Ana (5 indicação(ões))');
  assertEquals(digestEmail({ ...METRICS, nps_answers: 0, new_errors: [], partners: [] }).paragraphs.some((p) => p.includes('NPS')), false);
});

Deno.test('dueAlerts: ligado, acima do limite e fora do intervalo de repetição', () => {
  const base: AlertRow = { ac_key: 'erros_hora', ac_enabled: true, ac_value: 30, ac_threshold: 20, ac_over: true, ac_due: true, ac_detail: '30 erro(s)' };
  const rows = [base, { ...base, ac_key: 'jobs_falhando', ac_due: false }, { ...base, ac_key: 'suporte_atrasado', ac_enabled: false }, { ...base, ac_key: 'cadastros_queda', ac_over: false }];
  assertEquals(dueAlerts(rows).map((r) => r.ac_key), ['erros_hora']);
  const e = alertEmail(dueAlerts(rows));
  assertEquals(e.heading, 'Erros do app');
  assertStringIncludes(e.paragraphs[0], '30 erro(s) (limite: 20)');
});
