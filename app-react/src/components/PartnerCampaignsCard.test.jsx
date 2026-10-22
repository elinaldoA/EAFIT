// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ campaigns: vi.fn(), materials: vi.fn(), download: vi.fn() }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/partnerCampaign', async orig => ({
  ...(await orig()),
  fetchMyCampaigns: (...a) => h.campaigns(...a),
  fetchCampaignMaterials: (...a) => h.materials(...a),
}));
vi.mock('../lib/promoMaterials', async orig => ({
  ...(await orig()),
  downloadPromoMaterial: (...a) => h.download(...a),
}));

import PartnerCampaignsCard from './PartnerCampaignsCard';

const ACTIVE = {
  id: 'c1', slug: 'verao-26', title: 'Verão 2026', description: 'Traga a galera', caption: 'Bora! {link}', goal: '10 cadastros = brinde',
  startsOn: '2026-10-01', endsOn: '', linkKind: 'ref', code: 'ana', visits: 7, signups: 3,
};
const ENDED = { ...ACTIVE, id: 'c2', slug: 'inverno-26', title: 'Inverno', endsOn: '2020-01-31', caption: '', goal: '', description: '', visits: 1, signups: 0 };
const FILE = { id: 'm1', campaign_id: 'c1', title: 'Arte do feed', description: '', storage_path: 'a.png', file_name: 'a.png', mime_type: 'image/png', size_bytes: 2048 };

beforeEach(() => {
  h.campaigns.mockReset();
  h.materials.mockReset().mockResolvedValue([FILE]);
  h.download.mockReset().mockResolvedValue();
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue() } });
});
afterEach(() => { cleanup(); });

describe('PartnerCampaignsCard', () => {
  it('sem campanha, não aparece', async () => {
    h.campaigns.mockResolvedValue([]);
    const { container } = render(<PartnerCampaignsCard toast={vi.fn()} />);
    await waitFor(() => expect(h.campaigns).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('mostra a campanha com o link do parceiro, o texto, a meta, os números e o material', async () => {
    h.campaigns.mockResolvedValue([ACTIVE, ENDED]);
    const toast = vi.fn();
    render(<PartnerCampaignsCard toast={toast} />);

    expect(await screen.findByText('Verão 2026')).toBeTruthy();
    const link = 'https://eafit.com.br/app/?ref=ana&utm_campaign=verao-26';
    expect(screen.getByText(link)).toBeTruthy();
    expect(screen.getByText(`Bora! ${link}`)).toBeTruthy();
    expect(screen.getByText(/10 cadastros = brinde/)).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('Sem data para acabar')).toBeTruthy();
    expect(h.materials).toHaveBeenCalledWith(['c1', 'c2']);

    fireEvent.click(screen.getByText('Copiar texto'));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`Bora! ${link}`));
    expect(toast).toHaveBeenCalledWith('📋 Texto copiado');

    fireEvent.click(await screen.findByText('Baixar'));
    await waitFor(() => expect(h.download).toHaveBeenCalledWith(FILE));

    // Encerrada: só os números, sem link para divulgar.
    expect(screen.getByText(/Encerrada em/)).toBeTruthy();
    expect(screen.getAllByText('Copiar link')).toHaveLength(1);
  });
});
