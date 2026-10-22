// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: mockRpc } }));

import {
  capturePartnerCampaign, pendingPartnerCampaign, clearPartnerCampaign, campaignLink, campaignCaption, isEnded, fetchMyCampaigns,
} from './partnerCampaign';

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  localStorage.clear();
  mockRpc.mockReset();
});

describe('campanha do link', () => {
  it('guarda a campanha só quando o link é de parceiro', () => {
    capturePartnerCampaign('?utm_campaign=verao-26', 1000);
    expect(pendingPartnerCampaign(1000)).toBe('');
    capturePartnerCampaign('?ref=ana&utm_campaign=Verao-26', 1000);
    expect(pendingPartnerCampaign(1000)).toBe('verao-26');
  });

  it('link de personal também vale e a campanha mais recente substitui', () => {
    capturePartnerCampaign('?ref=ana&utm_campaign=verao-26', 1000);
    capturePartnerCampaign('?personal=BIA123&utm_campaign=natal-26', 2000);
    expect(pendingPartnerCampaign(2000)).toBe('natal-26');
  });

  it('ignora slug inválido, vence em 30 dias e some ao limpar', () => {
    capturePartnerCampaign('?ref=ana&utm_campaign=a', 1000);
    expect(pendingPartnerCampaign(1000)).toBe('');
    capturePartnerCampaign('?ref=ana&utm_campaign=verao-26', 1000);
    expect(pendingPartnerCampaign(1000 + 31 * DAY)).toBe('');
    expect(pendingPartnerCampaign(1000 + DAY)).toBe('verao-26');
    clearPartnerCampaign();
    expect(pendingPartnerCampaign(1000)).toBe('');
  });
});

describe('links e textos', () => {
  const amb = { slug: 'verao-26', linkKind: 'ref', code: 'ana', caption: 'Bora treinar! {link}' };
  const trainer = { slug: 'verao-26', linkKind: 'personal', code: 'BIA123', caption: 'Treine comigo' };

  it('link do parceiro com a campanha', () => {
    expect(campaignLink(amb)).toBe('https://eafit.com.br/app/?ref=ana&utm_campaign=verao-26');
    expect(campaignLink(amb, 'instagram')).toBe('https://eafit.com.br/app/?ref=ana&origem=instagram&utm_campaign=verao-26');
    expect(campaignLink(trainer)).toBe('https://eafit.com.br/app/?personal=BIA123&utm_campaign=verao-26');
  });

  it('texto troca {link} pelo link, ou põe o link no fim', () => {
    expect(campaignCaption(amb)).toBe('Bora treinar! https://eafit.com.br/app/?ref=ana&utm_campaign=verao-26');
    expect(campaignCaption(trainer)).toBe('Treine comigo\nhttps://eafit.com.br/app/?personal=BIA123&utm_campaign=verao-26');
    expect(campaignCaption({ ...amb, caption: '' })).toBe('');
  });

  it('encerrada só depois do último dia', () => {
    expect(isEnded({ endsOn: '2026-10-20' }, '2026-10-21')).toBe(true);
    expect(isEnded({ endsOn: '2026-10-21' }, '2026-10-21')).toBe(false);
    expect(isEnded({ endsOn: '' }, '2026-10-21')).toBe(false);
  });

  it('lê as campanhas do parceiro', async () => {
    mockRpc.mockResolvedValue({
      data: [{ pc_id: 'c1', pc_slug: 'verao-26', pc_title: 'Verão', pc_description: null, pc_caption: 'x', pc_goal: '', pc_starts_on: '2026-10-01', pc_ends_on: null, pc_link_kind: 'ref', pc_code: 'ana', pc_visits: '4', pc_signups: '2' }],
      error: null,
    });
    const [c] = await fetchMyCampaigns();
    expect(mockRpc).toHaveBeenCalledWith('my_partner_campaigns');
    expect(c).toMatchObject({ id: 'c1', slug: 'verao-26', description: '', endsOn: '', linkKind: 'ref', code: 'ana', visits: 4, signups: 2 });
  });
});
