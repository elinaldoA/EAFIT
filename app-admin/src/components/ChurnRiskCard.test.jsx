// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockRpc, mockInvoke } = vi.hoisted(() => ({ mockRpc: vi.fn(), mockInvoke: vi.fn() }));
vi.mock('../lib/supabase', () => ({ db: { rpc: mockRpc, functions: { invoke: mockInvoke } } }));

import ChurnRiskCard from './ChurnRiskCard';
import { contactQueue, mapRisk, riskLevel, suggestedMessage } from '../lib/churnRisk';

const NOW = new Date('2026-10-20T12:00:00Z').getTime();
const row = (over = {}) => ({
  cr_user: 'u1', cr_email: 'ana@x.com', cr_name: 'Ana Souza', cr_score: 78,
  cr_reasons: ['intervalo', 'queda'], cr_last_day: '2026-10-10', cr_days_since: 10, cr_typical_gap: 2.5,
  cr_recent14: 2, cr_prev14: 6, cr_wellbeing: null, cr_plan_end: null, cr_last_open: null, cr_last_contact: null, ...over,
});

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('churnRisk', () => {
  it('faixas, fila sem quem recebeu aviso há menos de 3 dias e mensagem sugerida', () => {
    expect([riskLevel(50), riskLevel(49), riskLevel(24)]).toEqual(['high', 'medium', 'low']);
    const rows = [
      mapRisk(row()),
      mapRisk(row({ cr_user: 'u2', cr_last_contact: '2026-10-19T12:00:00Z' })),
      mapRisk(row({ cr_user: 'u3', cr_last_contact: '2026-10-10T12:00:00Z' })),
      mapRisk(row({ cr_user: 'u4', cr_score: 30 })),
    ];
    expect(contactQueue(rows, NOW).map(r => r.id)).toEqual(['u1', 'u3']);
    expect(suggestedMessage(rows[0]).body).toMatch(/^Ana, /);
    expect(suggestedMessage(mapRisk(row({ cr_reasons: ['desconforto'] }))).title).toBe('💬 Como você está?');
    expect(suggestedMessage(mapRisk(row({ cr_name: 'ana@x.com' }))).body).not.toMatch(/@/);
  });
});

describe('ChurnRiskCard', () => {
  it('mostra a fila, troca de lista e envia o push editável para a pessoa', async () => {
    mockRpc.mockResolvedValue({ data: [row(), row({ cr_user: 'u2', cr_name: 'Bia', cr_score: 30, cr_reasons: ['plano'] })], error: null });
    mockInvoke.mockResolvedValue({ data: { ok: true, sent: 1 }, error: null });
    render(<MemoryRouter><ChurnRiskCard /></MemoryRouter>);

    expect(await screen.findByText('Ana Souza')).toBeTruthy();
    expect(screen.queryByText('Bia')).toBeNull();
    expect(screen.getByText('Passou do intervalo habitual · Treinando menos')).toBeTruthy();
    expect(screen.getByText('78 · Alto')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    expect(screen.getByText('Bia')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Mandar push' })[0]);
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Oi Ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar push' }));
    await waitFor(() => expect(screen.getByText('enviado agora')).toBeTruthy());
    expect(mockInvoke).toHaveBeenCalledWith('admin-broadcast', {
      body: { title: '💪 Sentimos sua falta', body: 'Oi Ana', targetUserIds: ['u1'] },
    });
  });

  it('erro da RPC aparece no card', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('not_authorized') });
    render(<MemoryRouter><ChurnRiskCard /></MemoryRouter>);
    expect(await screen.findByText('not_authorized')).toBeTruthy();
  });
});
