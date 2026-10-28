// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

const { lib } = vi.hoisted(() => ({ lib: { fetchCampaignEffect: vi.fn() } }));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/campaignEffect', async orig => ({ ...(await orig()), ...lib }));

import CampaignResults from './CampaignResults';
import { mapCampaign, summarizeCampaigns, withPushEvents } from '../lib/campaignEffect';

const manual = {
  ce_key: 'c1', ce_origin: 'manual', ce_kind: 'aviso', ce_title: 'Volta!', ce_body: 'Treino novo',
  ce_first_at: '2026-10-10T12:00:00Z', ce_last_at: '2026-10-10T12:00:05Z',
  ce_sent: 4, ce_read: 2, ce_app1: 3, ce_trained1: 1, ce_trained3: 3, ce_before3: 1,
};
const auto = {
  ce_key: 'auto|plan_expiring', ce_origin: 'auto', ce_kind: 'plan_expiring', ce_title: 'Plano vencendo', ce_body: 'x',
  ce_first_at: '2026-10-01T12:00:00Z', ce_last_at: '2026-10-15T12:00:00Z',
  ce_sent: 10, ce_read: 0, ce_app1: 5, ce_trained1: 2, ce_trained3: 4, ce_before3: 5,
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('campaignEffect', () => {
  it('calcula as taxas e a diferença em pontos percentuais', () => {
    const c = mapCampaign(manual);
    expect(c).toMatchObject({ sent: 4, readPct: 50, appPct: 75, trained3Pct: 75, before3Pct: 25, lift: 50 });
    expect(mapCampaign({ ...manual, ce_sent: 0 }).lift).toBeNull();
    const t = summarizeCampaigns([c, mapCampaign(auto)]);
    expect(t).toMatchObject({ sent: 14, campaigns: 2, trained3: 7, before3: 6, trained3Pct: 50, lift: 7 });
  });
});

describe('withPushEvents', () => {
  it('junta chegou/tocou pelo id da campanha e deixa as demais sem taxa', () => {
    const [m, a] = withPushEvents([mapCampaign(manual), mapCampaign(auto)], [{ pe_campaign: 'c1', pe_received: 3, pe_clicked: 1 }]);
    expect(m).toMatchObject({ received: 3, clicked: 1, receivedPct: 75, clickedPct: 25 });
    expect(a).toMatchObject({ received: null, receivedPct: null, clickedPct: null });
  });
});

describe('CampaignResults', () => {
  it('mostra os envios com as taxas, filtra por origem e troca o período', async () => {
    lib.fetchCampaignEffect.mockResolvedValue([mapCampaign(manual), mapCampaign(auto)]);
    render(<CampaignResults />);
    expect(await screen.findByText('Volta!')).toBeTruthy();
    expect(screen.getByText('Plano vencendo')).toBeTruthy();
    expect(screen.getByText('+50 p.p.')).toBeTruthy();
    expect(screen.getByText('-10 p.p.')).toBeTruthy();
    expect(screen.getByText('envios (2 campanha(s))')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Automáticas' }));
    expect(screen.queryByText('Volta!')).toBeNull();
    expect(screen.getByText('envios (1 campanha(s))')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '90 dias' }));
    expect(lib.fetchCampaignEffect).toHaveBeenLastCalledWith(90);
  });

  it('sem envios mostra o aviso; erro aparece na tela', async () => {
    lib.fetchCampaignEffect.mockResolvedValue([]);
    const { unmount } = render(<CampaignResults />);
    expect(await screen.findByText('Nenhum envio no período.')).toBeTruthy();
    unmount();

    lib.fetchCampaignEffect.mockRejectedValue(new Error('not_authorized'));
    render(<CampaignResults />);
    expect(await screen.findByText('not_authorized')).toBeTruthy();
  });
});
