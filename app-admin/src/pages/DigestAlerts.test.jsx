// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const { mockRpc, mockFrom, mockInvoke, upsert, update } = vi.hoisted(() => ({
  mockRpc: vi.fn(), mockFrom: vi.fn(), mockInvoke: vi.fn(), upsert: vi.fn(), update: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({ db: { rpc: mockRpc, from: mockFrom, functions: { invoke: mockInvoke } } }));
vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => ({ adminUser: { id: 'adm1', email: 'eu@x.com' } }) }));

import DigestAlerts from './DigestAlerts';
import { saveRule, trend } from '../lib/digest';

const PREVIEW = {
  signups: 12, signups_prev: 9, trained: 40, trained_prev: 44, workouts: 120, workouts_prev: 100, errors: 3, errors_prev: 0,
  new_errors: [{ message: 'TypeError x', n: 2 }], support_open: 4, support_late: 1, nps: 42, nps_answers: 10, risk_high: 7,
  partners: [{ name: 'Ana', kind: 'influenciador', n: 5 }],
};
const STATUS = [{ ac_key: 'erros_hora', ac_enabled: true, ac_value: 30, ac_threshold: 20, ac_over: true, ac_due: false, ac_detail: '30 erro(s) do app na última hora' }];
const RULES = [{ key: 'erros_hora', enabled: true, threshold: 20, cooldown_hours: 6, last_fired_at: '2026-10-20T10:00:00Z' }];
const LOG = [{ id: 1, key: 'erros_hora', value: 30, threshold: 20, detail: '30 erro(s)', notified: 2, created_at: '2026-10-20T10:00:00Z' }];

function chain(data) {
  const c = { select: () => c, order: () => c, limit: async () => ({ data, error: null }), eq: () => c, maybeSingle: async () => ({ data: null, error: null }) };
  c.then = undefined;
  return c;
}

beforeEach(() => {
  vi.clearAllMocks();
  upsert.mockResolvedValue({ error: null });
  update.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  mockRpc.mockImplementation(async name => ({ data: name === 'admin_digest_preview' ? PREVIEW : STATUS, error: null }));
  mockFrom.mockImplementation(table => {
    if (table === 'admin_alert_rules') return { select: async () => ({ data: RULES, error: null }), update };
    if (table === 'admin_alert_log') return chain(LOG);
    return { ...chain(null), upsert };
  });
  mockInvoke.mockResolvedValue({ data: { sent: 1 }, error: null });
});
afterEach(cleanup);

describe('lib/digest', () => {
  it('tendência e validação da regra', async () => {
    expect(trend(12, 9)).toEqual({ value: 12, diff: 3, pct: 33 });
    expect(trend(3, 0).pct).toBeNull();
    await expect(saveRule('erros_hora', { enabled: true, threshold: -1, cooldownHours: 6 })).rejects.toThrow('Limite inválido.');
    await expect(saveRule('erros_hora', { enabled: true, threshold: 5, cooldownHours: 0 })).rejects.toThrow(/Repetição/);
  });
});

describe('DigestAlerts', () => {
  it('mostra prévia, alerta acima do limite e histórico; salva preferência, regra e envia para mim', async () => {
    render(<DigestAlerts />);
    expect(await screen.findByText(/cadastros · \+3 \(\+33%\)/)).toBeTruthy();
    expect(screen.getByText(/“TypeError x” \(2×\)/)).toBeTruthy();
    expect(screen.getByText('30').className).toContain('badge--danger');
    expect(screen.getByText('30 erro(s)')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Relatório semanal por e-mail'));
    await waitFor(() => expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'adm1', weekly_digest: false, alerts: true })));

    fireEvent.change(screen.getByLabelText('Limite de Erros do app'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, threshold: 50, cooldown_hours: 6 })));

    fireEvent.click(screen.getByRole('button', { name: 'Enviar para mim agora' }));
    expect(await screen.findByText('Relatório enviado para eu@x.com.')).toBeTruthy();
    expect(mockInvoke).toHaveBeenCalledWith('send-admin-digest', { body: { mode: 'digest_me' } });
  });

  it('erro na prévia aparece', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('not_authorized') });
    render(<DigestAlerts />);
    expect(await screen.findByText('not_authorized')).toBeTruthy();
  });
});
