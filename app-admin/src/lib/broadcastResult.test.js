import { describe, it, expect } from 'vitest';
import { emailResult, testResult } from './broadcastResult';

describe('emailResult', () => {
  it('só aparece quando o envio também foi por e-mail', () => {
    expect(emailResult({ sent: 2, targetCount: 3 })).toBe('');
    expect(emailResult({ emailSent: 4, emailTargetCount: 5 })).toBe(' E-mail: 4 de 5.');
  });
});

describe('testResult', () => {
  it('sem push e sem e-mail pedido: aponta as duas saídas', () => {
    const msg = testResult({ targetCount: 0, sent: 0 });
    expect(msg).toMatch(/^Erro: você não tem push ativo/);
    expect(msg).toMatch(/Enviar também por e-mail/);
  });

  it('sem push, mas com e-mail enviado: é sucesso', () => {
    expect(testResult({ targetCount: 0, sent: 0, emailTargetCount: 1, emailSent: 1 }))
      .toBe('Teste enviado: 0 de 0 dispositivo(s). E-mail: 1 de 1.');
  });

  it('e-mail pedido que não saiu: diz se a conta não pode receber ou se o envio falhou', () => {
    expect(testResult({ targetCount: 1, sent: 1, emailTargetCount: 0, emailSent: 0 })).toMatch(/não pode receber comunicados/);
    expect(testResult({ targetCount: 0, sent: 0, emailTargetCount: 1, emailSent: 0 })).toMatch(/o Gmail recusou/);
  });

  it('só push: mensagem de sempre', () => {
    expect(testResult({ targetCount: 2, sent: 2 })).toBe('Teste enviado: 2 de 2 dispositivo(s).');
  });
});
