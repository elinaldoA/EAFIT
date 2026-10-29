import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: mockRpc } }));

import { buildRadar, fetchRadar } from './radar';

const keys = items => items.map(i => i.key);

describe('buildRadar', () => {
  it('sem dados não inventa nada', () => {
    expect(buildRadar()).toEqual([]);
    expect(buildRadar({ digest: {}, alerts: [], attention: {} })).toEqual([]);
  });

  it('ordena por gravidade: alerta e dor antes de avisos, informação e boas notícias', () => {
    const items = buildRadar({
      digest: { signups: 30, signups_prev: 10, support_late: 2, risk_high: 4, partners: [{ name: 'Ana', n: 3 }] },
      alerts: [{ ac_key: 'erros_hora', ac_enabled: true, ac_over: true, ac_detail: '12 erro(s) do app na última hora' }],
      attention: { pain: 1, feedback: 2, overdue: 0 },
    });
    expect(items.map(i => i.tone)).toEqual(['danger', 'danger', 'warning', 'info', 'info', 'good', 'good']);
    expect(keys(items).slice(0, 2)).toEqual(['alerta:erros_hora', 'dor']);
    expect(items[0].to).toBe('/erros');
  });

  it('ignora alerta desligado ou abaixo do limite', () => {
    const alerts = [
      { ac_key: 'erros_hora', ac_enabled: false, ac_over: true, ac_detail: 'x' },
      { ac_key: 'jobs_falhando', ac_enabled: true, ac_over: false, ac_detail: 'y' },
    ];
    expect(buildRadar({ alerts })).toEqual([]);
  });

  it('não repete o que um alerta disparado já disse', () => {
    const items = buildRadar({
      digest: { support_late: 5, signups: 5, signups_prev: 20, new_errors: [{ message: 'boom', n: 3 }] },
      alerts: [
        { ac_key: 'suporte_atrasado', ac_enabled: true, ac_over: true, ac_detail: 'a' },
        { ac_key: 'cadastros_queda', ac_enabled: true, ac_over: true, ac_detail: 'b' },
        { ac_key: 'erros_hora', ac_enabled: true, ac_over: true, ac_detail: 'c' },
      ],
    });
    expect(keys(items)).toEqual(['alerta:suporte_atrasado', 'alerta:cadastros_queda', 'alerta:erros_hora']);
  });

  it('só fala de tendência com base mínima de 10', () => {
    expect(buildRadar({ digest: { signups: 8, signups_prev: 2 } })).toEqual([]);
    const up = buildRadar({ digest: { signups: 15, signups_prev: 10 } });
    expect(up[0]).toMatchObject({ key: 'cadastros', tone: 'good' });
    expect(up[0].text).toContain('50%');
    const down = buildRadar({ digest: { trained: 6, trained_prev: 10 } });
    expect(down[0]).toMatchObject({ key: 'treinaram', tone: 'warning' });
    expect(down[0].text).toContain('40%');
    expect(buildRadar({ digest: { trained: 11, trained_prev: 10 } })).toEqual([]);
  });

  it('erros novos citam o mais comum; alta de erros só sem erros novos', () => {
    const fresh = buildRadar({ digest: { errors: 50, errors_prev: 10, new_errors: [{ message: 'TypeError: x', n: 9 }, { message: 'y', n: 1 }] } });
    expect(keys(fresh)).toEqual(['erros-novos']);
    expect(fresh[0].text).toContain('2 tipos');
    expect(fresh[0].text).toContain('TypeError: x');
    expect(keys(buildRadar({ digest: { errors: 30, errors_prev: 10 } }))).toEqual(['erros-alta']);
  });

  it('NPS só com 5+ respostas', () => {
    expect(buildRadar({ digest: { nps: -20, nps_answers: 3 } })).toEqual([]);
    expect(buildRadar({ digest: { nps: -20, nps_answers: 8 } })[0]).toMatchObject({ key: 'nps', tone: 'warning' });
    expect(buildRadar({ digest: { nps: 60, nps_answers: 8 } })[0]).toMatchObject({ key: 'nps', tone: 'good' });
    expect(buildRadar({ digest: { nps: 20, nps_answers: 8 } })).toEqual([]);
  });

  it('usa singular e plural', () => {
    expect(buildRadar({ attention: { feedback: 1 } })[0].text).toBe('1 feedback novo de usuários para ler');
    expect(buildRadar({ attention: { overdue: 2 } })[0].text).toContain('2 notificações agendadas passaram');
  });
});

describe('fetchRadar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('junta as três fontes', async () => {
    mockRpc.mockImplementation(name => Promise.resolve({
      admin_digest_preview: { data: { support_late: 1 }, error: null },
      admin_alert_status: { data: [], error: null },
      admin_attention_counts: { data: [{ at_feedback: 2, at_pain: 0, at_errors: 0, at_overdue: 0 }], error: null },
    }[name]));
    const r = await fetchRadar();
    expect(r.partial).toBe(false);
    expect(keys(r.items)).toEqual(['suporte', 'feedback']);
  });

  it('fonte com erro vira radar parcial, sem quebrar', async () => {
    mockRpc.mockImplementation(name => (name === 'admin_alert_status'
      ? Promise.reject(new Error('rede'))
      : Promise.resolve({ data: null, error: { message: 'not_authorized' } })));
    const r = await fetchRadar();
    expect(r).toEqual({ items: [], partial: true });
  });
});
