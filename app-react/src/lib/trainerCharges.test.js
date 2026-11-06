import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import {
  parseMoney, formatMoney, chargeState, daysLate, chargeSummary, overdueByClient, friendlyChargeError,
} from './trainerCharges';

describe('parseMoney', () => {
  it('aceita formatos comuns e devolve centavos', () => {
    expect(parseMoney('150')).toBe(15000);
    expect(parseMoney('150,5')).toBe(15050);
    expect(parseMoney('150.50')).toBe(15050);
    expect(parseMoney('1.250,90')).toBe(125090);
    expect(parseMoney('1.250')).toBe(125000);
    expect(parseMoney('R$ 99,90')).toBe(9990);
  });

  it('rejeita vazio, zero, negativo, lixo e valor acima do limite', () => {
    for (const v of ['', '   ', '0', '0,00', '-10', 'abc', '10,999', '1,2,3', '100000,01', null, undefined]) {
      expect(parseMoney(v)).toBeNull();
    }
    expect(parseMoney('100000')).toBe(10_000_000);
  });
});

describe('formatMoney', () => {
  it('formata centavos em reais', () => {
    expect(formatMoney(15050).replace(/\s/g, ' ')).toMatch(/R\$\s?150,50/);
    expect(formatMoney(0)).toMatch(/0,00/);
  });
});

const TODAY = '2026-11-20';
const c = (over = {}) => ({ id: 'x', clientId: 'a', amount: 10000, due: '2026-11-25', status: 'open', paidAt: null, ...over });

describe('chargeState', () => {
  it('em aberto: a vencer, vence hoje ou em atraso conforme o vencimento', () => {
    expect(chargeState(c({ due: '2026-11-21' }), TODAY)).toBe('open');
    expect(chargeState(c({ due: TODAY }), TODAY)).toBe('today');
    expect(chargeState(c({ due: '2026-11-19' }), TODAY)).toBe('overdue');
  });

  it('pago e cancelado ignoram o vencimento', () => {
    expect(chargeState(c({ status: 'paid', due: '2026-01-01', paidAt: '2026-11-01T12:00:00Z' }), TODAY)).toBe('paid');
    expect(chargeState(c({ status: 'cancelled', due: '2026-01-01' }), TODAY)).toBe('cancelled');
  });

  it('conta os dias de atraso', () => {
    expect(daysLate(c({ due: '2026-11-10' }), TODAY)).toBe(10);
    expect(daysLate(c({ due: '2026-12-10' }), TODAY)).toBe(0);
  });
});

describe('chargeSummary / overdueByClient', () => {
  const rows = [
    c({ id: '1', amount: 10000, due: '2026-11-25' }),
    c({ id: '2', amount: 5000, due: TODAY }),
    c({ id: '3', amount: 7000, due: '2026-11-10', clientId: 'a' }),
    c({ id: '4', amount: 3000, due: '2026-11-01', clientId: 'a' }),
    c({ id: '5', amount: 9000, due: '2026-10-01', clientId: 'b' }),
    c({ id: '6', amount: 20000, status: 'paid', paidAt: new Date(2026, 10, 5, 12).toISOString() }),
    c({ id: '7', amount: 1000, status: 'paid', paidAt: new Date(2026, 9, 5, 12).toISOString() }),
    c({ id: '8', amount: 99999, status: 'cancelled', due: '2026-10-01' }),
  ];

  it('soma a receber, em atraso e recebido só no mês corrente', () => {
    expect(chargeSummary(rows, TODAY)).toEqual({
      upcoming: 15000, overdue: 19000, overdueCount: 3, overdueClients: 2, receivedMonth: 20000,
    });
  });

  it('agrupa o atraso por aluno com o maior número de dias', () => {
    expect(overdueByClient(rows, TODAY)).toEqual({
      a: { count: 2, cents: 10000, days: 19 },
      b: { count: 1, cents: 9000, days: 50 },
    });
  });
});

describe('friendlyChargeError', () => {
  it('traduz o código do banco e tem texto padrão', () => {
    expect(friendlyChargeError(new Error('too_many'))).toMatch(/Muitas cobranças/);
    expect(friendlyChargeError(new Error('boom'))).toBe('Não foi possível concluir. Tente de novo.');
  });
});
