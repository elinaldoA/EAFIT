// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const { mockRpc, mockFrom, upsert } = vi.hoisted(() => ({ mockRpc: vi.fn(), mockFrom: vi.fn(), upsert: vi.fn() }));
vi.mock('../lib/supabase', () => ({ db: { rpc: mockRpc, from: mockFrom } }));
vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => ({ adminUser: { id: 'adm1' } }) }));

import Campaigns from './Campaigns';
import { buildCampaigns, saveCost } from '../lib/campaigns';

const ROWS = [
  { ca_source: 'instagram', ca_campaign: 'outubro_rosa', ca_visits: 200, ca_signups: 20, ca_confirmed: 18, ca_activated: 10, ca_active30: 8, ca_attributed: 20 },
  { ca_source: 'sem_origem', ca_campaign: '', ca_visits: 0, ca_signups: 5, ca_confirmed: 5, ca_activated: 1, ca_active30: 1, ca_attributed: 0 },
];
const COSTS = [{ source: 'instagram', campaign: 'outubro_rosa', cost: 150, notes: '' }];

beforeEach(() => {
  vi.clearAllMocks();
  upsert.mockResolvedValue({ error: null });
  mockRpc.mockResolvedValue({ data: ROWS, error: null });
  mockFrom.mockReturnValue({ select: async () => ({ data: COSTS, error: null }), upsert });
});
afterEach(cleanup);

describe('campaigns', () => {
  it('conversão, ativação e custo por ativado', () => {
    const { items, totals } = buildCampaigns(ROWS, COSTS);
    expect(items[0]).toMatchObject({ label: 'Instagram', conversionPct: 10, activationPct: 50, cost: 150, costPerSignup: 7.5, costPerActivated: 15 });
    expect(items[1]).toMatchObject({ label: 'Sem origem registrada', conversionPct: null, cost: null });
    expect(totals).toMatchObject({ signups: 25, activated: 11, activationPct: 44, cost: 150, costPerActivated: 13.64 });
  });

  it('valida e salva o custo com vírgula', async () => {
    await expect(saveCost('instagram', 'x', 'abc', 'adm1')).rejects.toThrow('Valor inválido.');
    await saveCost('instagram', 'x', '99,90', 'adm1');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ source: 'instagram', campaign: 'x', cost: 99.9, updated_by: 'adm1' }));
  });
});

describe('Campaigns', () => {
  it('mostra a tabela, edita o gasto e troca o período', async () => {
    render(<Campaigns />);
    expect(await screen.findByText('Instagram')).toBeTruthy();
    expect(screen.getByText('10 (50%)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Custo de Instagram outubro_rosa' }));
    fireEvent.change(screen.getByLabelText('Valor gasto (R$)'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ cost: 200 })));
    fireEvent.click(screen.getByRole('button', { name: '90 dias' }));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('admin_campaign_attribution', { days_back: 90 }));
  });
});
