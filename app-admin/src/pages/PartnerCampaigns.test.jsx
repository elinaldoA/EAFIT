// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  fetchCampaigns: vi.fn(), fetchCampaignResults: vi.fn(), fetchCampaignMaterials: vi.fn(), saveCampaign: vi.fn(),
  notifyPartners: vi.fn(), invoke: vi.fn(), from: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({ db: { functions: { invoke: h.invoke }, from: h.from } }));
vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => ({ adminUser: { id: 'adm1' } }) }));
vi.mock('../lib/partnerCampaigns', async orig => ({
  ...(await orig()),
  fetchCampaigns: (...a) => h.fetchCampaigns(...a),
  fetchCampaignResults: (...a) => h.fetchCampaignResults(...a),
  fetchCampaignMaterials: (...a) => h.fetchCampaignMaterials(...a),
  saveCampaign: (...a) => h.saveCampaign(...a),
  notifyPartners: (...a) => h.notifyPartners(...a),
}));

import PartnerCampaigns from './PartnerCampaigns';
import * as lib from '../lib/partnerCampaigns';

const CAMPAIGN = {
  id: 'c1', slug: 'verao-26', title: 'Verão 2026', description: 'Traga a galera', caption: 'Bora! {link}', goal: '',
  audiences: ['embaixador', 'personal'], starts_on: '2026-10-01', ends_on: null, published_at: '2026-10-01T12:00:00Z',
  visits: 12, signups: 4, activated: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  h.fetchCampaigns.mockResolvedValue([CAMPAIGN]);
  h.fetchCampaignResults.mockResolvedValue([
    { kind: 'embaixador', name: 'Ana', code: 'ana', visits: 10, signups: 4, activated: 2 },
    { kind: 'personal', name: 'Coach Bia', code: 'BIA123', visits: 0, signups: 0, activated: 0 },
  ]);
  h.fetchCampaignMaterials.mockResolvedValue([]);
  h.saveCampaign.mockImplementation(async d => ({ ...CAMPAIGN, id: 'c2', title: d.title, slug: d.slug, published_at: new Date().toISOString() }));
  h.notifyPartners.mockResolvedValue(3);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const renderPage = () => render(<MemoryRouter><PartnerCampaigns /></MemoryRouter>);

describe('lib/partnerCampaigns', () => {
  it('endereço a partir do título e situação pela data', () => {
    expect(lib.slugify('Verão 2026: traga 1 amigo!')).toBe('verao-2026-traga-1-amigo');
    expect(lib.campaignStatus({ published_at: null }, '2026-10-21')).toBe('rascunho');
    expect(lib.campaignStatus({ published_at: 'x', starts_on: '2026-11-01' }, '2026-10-21')).toBe('agendada');
    expect(lib.campaignStatus({ published_at: 'x', starts_on: '2026-10-01', ends_on: '2026-10-20' }, '2026-10-21')).toBe('encerrada');
    expect(lib.campaignStatus({ published_at: 'x', starts_on: '2026-10-01', ends_on: null }, '2026-10-21')).toBe('ativa');
  });

  it('modelo preenche o rascunho com período e endereço do mês', () => {
    const d = lib.applyTemplate(lib.emptyDraft('2026-11-05'), 'personal-alunos');
    expect(d).toMatchObject({ title: 'Seus alunos no EAFIT', slug: 'seus-alunos-no-eafit-11-2026', audiences: ['personal'], startsOn: '2026-11-05', endsOn: '2026-12-04' });
    expect(d.caption).toContain('{link}');
    expect(lib.validateDraft(d)).toBe('');
    for (const tpl of lib.CAMPAIGN_TEMPLATES) {
      const filled = lib.applyTemplate(lib.emptyDraft('2026-01-01'), tpl.key);
      expect(lib.validateDraft(filled)).toBe('');
      expect(filled.caption.length).toBeLessThanOrEqual(lib.TEXT_MAX);
    }
  });

  it('valida o rascunho', () => {
    const d = { ...lib.emptyDraft('2026-10-21'), title: 'Verão', slug: 'verao' };
    expect(lib.validateDraft(d)).toBe('');
    expect(lib.validateDraft({ ...d, slug: 'v' })).toMatch(/endereço/);
    expect(lib.validateDraft({ ...d, audiences: [] })).toMatch(/para quem/);
    expect(lib.validateDraft({ ...d, endsOn: '2026-10-01' })).toMatch(/fim/);
  });

  it('avisa cada grupo do público: programa por audience, personais pela lista', async () => {
    const real = await vi.importActual('../lib/partnerCampaigns');
    h.invoke.mockResolvedValue({ data: { recipients: 2 }, error: null });
    h.from.mockReturnValue({ select: async () => ({ data: [{ user_id: 't1' }, { user_id: 't2' }, { user_id: 't3' }], error: null }) });
    const n = await real.notifyPartners(CAMPAIGN, { title: 'Nova', body: 'Texto' });
    expect(n).toBe(5);
    expect(h.invoke).toHaveBeenCalledWith('admin-broadcast', { body: { title: 'Nova', body: 'Texto', audience: 'embaixadores' } });
    expect(h.invoke).toHaveBeenCalledWith('admin-broadcast', { body: { title: 'Nova', body: 'Texto', targetUserIds: ['t1', 't2', 't3'] } });
    expect(h.invoke).toHaveBeenCalledTimes(2);
  });
});

describe('PartnerCampaigns', () => {
  it('lista as campanhas e mostra o resultado por parceiro', async () => {
    renderPage();
    const row = (await screen.findByText('Verão 2026')).closest('tr');
    expect(row.textContent).toContain('Embaixadores, Personais');
    expect(row.textContent).toContain('No ar');
    expect(row.textContent).toContain('12');
    fireEvent.click(screen.getByText('Detalhes'));
    const ana = (await screen.findByText('Ana')).closest('tr');
    expect(ana.textContent).toContain('40%');
    expect(screen.getByText(/1 de 2 parceiros já trouxeram visitas/)).toBeTruthy();
    expect(h.fetchCampaignResults).toHaveBeenCalledWith('c1');
  });

  it('cria e publica: o endereço sai do título e o aviso aparece pronto', async () => {
    renderPage();
    await screen.findByText('Verão 2026');
    fireEvent.click(screen.getByText('Nova campanha'));
    fireEvent.change(screen.getByPlaceholderText('Ex.: Verão 2026 — traga um amigo'), { target: { value: 'Natal Fit' } });
    expect(screen.getByPlaceholderText('verao-2026').value).toBe('natal-fit');
    fireEvent.click(screen.getByText('Salvar e publicar'));
    await waitFor(() => expect(h.saveCampaign).toHaveBeenCalled());
    const [draft, adminId, publish] = h.saveCampaign.mock.calls[0];
    expect(draft).toMatchObject({ title: 'Natal Fit', slug: 'natal-fit', audiences: ['embaixador', 'influenciador', 'personal'] });
    expect(adminId).toBe('adm1');
    expect(publish).toBe(true);
    expect(await screen.findByText(/Campanha publicada/)).toBeTruthy();
  });

  it('começa de um modelo', async () => {
    renderPage();
    await screen.findByText('Verão 2026');
    fireEvent.click(screen.getByText('Nova campanha'));
    fireEvent.change(screen.getByDisplayValue('Em branco'), { target: { value: 'amigo' } });
    expect(screen.getByDisplayValue('Traga um amigo para treinar')).toBeTruthy();
    expect(screen.getByPlaceholderText('verao-2026').value).toMatch(/^traga-um-amigo-para-treinar-\d{2}-\d{4}$/);
  });

  it('envia o aviso aos parceiros', async () => {
    renderPage();
    await screen.findByText('Verão 2026');
    fireEvent.click(screen.getByText('Detalhes'));
    fireEvent.click(await screen.findByText('Avisar os parceiros'));
    expect(screen.getByDisplayValue('📣 Nova campanha: Verão 2026')).toBeTruthy();
    fireEvent.click(screen.getByText('Enviar aviso'));
    expect(await screen.findByText('Aviso enviado para 3 parceiro(s).')).toBeTruthy();
    expect(h.notifyPartners).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), expect.objectContaining({ title: '📣 Nova campanha: Verão 2026' }));
  });
});
