// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockRpc, mockFrom, upsert, update, del } = vi.hoisted(() => ({ mockRpc: vi.fn(), mockFrom: vi.fn(), upsert: vi.fn(), update: vi.fn(), del: vi.fn() }));
vi.mock('../lib/supabase', () => ({ db: { rpc: mockRpc, from: mockFrom } }));
vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => ({ adminUser: { id: 'adm1' } }) }));

import Commissions from './Commissions';
import { currentMonth, mapStatement, summarize } from '../lib/commissions';

const row = over => ({
  cs_ambassador: 'a1', cs_name: 'Ana Fit', cs_kind: 'influenciador', cs_code: 'anafit', cs_user: 'u1', cs_active: true,
  cs_referrals: 4, cs_activated: 3, cs_rate: 5, cs_amount: 15, cs_override: false,
  cs_payout_amount: null, cs_payout_status: null, cs_paid_at: null, cs_notes: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  upsert.mockResolvedValue({ error: null });
  const eq2 = { eq: vi.fn().mockResolvedValue({ error: null }) };
  update.mockReturnValue({ eq: vi.fn(() => Object.assign(Promise.resolve({ error: null }), eq2)) });
  del.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  mockRpc.mockResolvedValue({ data: [row(), row({ cs_ambassador: 'a2', cs_name: 'Beto', cs_kind: 'embaixador', cs_user: null, cs_amount: 20, cs_activated: 2, cs_rate: 10, cs_override: true, cs_payout_amount: 20, cs_payout_status: 'pago' })], error: null });
  mockFrom.mockReturnValue({ select: async () => ({ data: [{ kind: 'embaixador', per_activated: 0 }, { kind: 'influenciador', per_activated: 5 }], error: null }), upsert, update, delete: del });
});
afterEach(cleanup);

describe('commissions', () => {
  it('mês atual e totais', () => {
    expect(currentMonth(new Date('2026-10-01T02:00:00Z'))).toBe('2026-09');
    const t = summarize([mapStatement(row()), mapStatement(row({ cs_amount: 20, cs_payout_amount: 20, cs_payout_status: 'pago' }))]);
    expect(t).toMatchObject({ calculated: 35, paid: 20, pending: 0, open: 1, activated: 6 });
  });
});

describe('Commissions', () => {
  it('fecha o mês de um parceiro e salva a regra do tipo', async () => {
    render(<MemoryRouter><Commissions /></MemoryRouter>);
    expect(await screen.findByText('Ana Fit')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Fechar/ }));
    await waitFor(() => expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ ambassador_id: 'a1', amount: 15, activated: 3, status: 'pendente', updated_by: 'adm1' })));

    fireEvent.change(screen.getByLabelText('Valor para Embaixador'), { target: { value: '7,50' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Salvar' })[0]);
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ per_activated: 7.5, updated_by: 'adm1' })));
  });

  it('exceção vazia volta ao valor do tipo; erro aparece', async () => {
    render(<MemoryRouter><Commissions /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Valor de Beto' }));
    fireEvent.change(screen.getByLabelText('Exceção de Beto'), { target: { value: '' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Salvar' }).at(-1));
    await waitFor(() => expect(del).toHaveBeenCalled());
    cleanup();

    mockRpc.mockResolvedValue({ data: null, error: new Error('invalid_month') });
    render(<MemoryRouter><Commissions /></MemoryRouter>);
    expect(await screen.findByText('invalid_month')).toBeTruthy();
  });
});
