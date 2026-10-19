import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc, mockSelect } = vi.hoisted(() => ({ mockRpc: vi.fn(), mockSelect: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: mockRpc, from: () => ({ select: mockSelect }) } }));

import {
  ambassadorLink, suggestCode, isValidCode, conversion, ambassadorError,
  fetchAmbassadors, fetchReferrals, fetchUserAmbassador, createAmbassador, updateAmbassador,
  setInfluencer, fetchInfluencerPrograms, reviewInfluencerProgram, influencerPageUrl,
} from './ambassadors';

beforeEach(() => {
  mockRpc.mockReset();
  mockSelect.mockReset();
  mockSelect.mockResolvedValue({ data: [], error: null });
});

describe('helpers', () => {
  it('monta o link com código e canal', () => {
    expect(ambassadorLink('anafit')).toBe('https://eafit.com.br/?ref=anafit');
    expect(ambassadorLink('anafit', 'whatsapp')).toBe('https://eafit.com.br/?ref=anafit&origem=whatsapp');
  });

  it('sugere código sem acento e valida o formato do banco', () => {
    expect(suggestCode('Ana Souza Fitnéss!')).toBe('anasouzafitness');
    expect(isValidCode('ana-fit')).toBe(true);
    expect(isValidCode('ab')).toBe(false);
    expect(isValidCode('Ana')).toBe(false);
  });

  it('conversão só existe com visitas', () => {
    expect(conversion(0, 3)).toBeNull();
    expect(conversion(40, 10)).toBe(25);
  });

  it('traduz os erros do banco', () => {
    expect(ambassadorError({ message: 'code_taken' })).toBe('Esse código já está em uso.');
    expect(ambassadorError({ message: 'outra coisa' })).toBe('outra coisa');
  });
});

describe('consultas', () => {
  it('mapeiam as linhas e aguentam resposta vazia', async () => {
    mockRpc.mockResolvedValue({ data: [{ am_id: 'a1', am_user: 'u1', am_email: 'a@x', am_name: 'Ana', am_code: 'ana', am_active: true, am_visits: '10', am_signups: '2', am_total: '5', am_active_7d: '1' }], error: null });
    const [a] = await fetchAmbassadors(7);
    expect(mockRpc).toHaveBeenCalledWith('admin_ambassadors', { days_back: 7 });
    expect(a).toMatchObject({ id: 'a1', code: 'ana', visits: 10, signups: 2, total: 5, active7: 1, influencer: false });

    mockSelect.mockResolvedValue({ data: [{ id: 'a1', is_influencer: true }], error: null });
    expect((await fetchAmbassadors(7))[0].influencer).toBe(true);
    // banco sem a coluna: segue sem quebrar a lista
    mockSelect.mockResolvedValue({ data: null, error: { code: '42703' } });
    expect((await fetchAmbassadors(7))[0].influencer).toBe(false);

    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await fetchReferrals('a1')).toEqual([]);
    expect(mockRpc).toHaveBeenCalledWith('admin_ambassador_referrals', { p_ambassador: 'a1' });
    expect(await fetchUserAmbassador('u2')).toBeNull();
  });

  it('criar e editar normalizam o código e propagam o erro traduzido', async () => {
    mockRpc.mockResolvedValue({ data: 'id', error: null });
    await createAmbassador({ email: ' a@x ', name: ' Ana ', code: ' AnaFit ' });
    expect(mockRpc).toHaveBeenCalledWith('admin_create_ambassador', { p_email: 'a@x', p_name: 'Ana', p_code: 'anafit' });
    await updateAmbassador({ id: 'a1', name: 'Ana', code: 'ana', active: false });
    expect(mockRpc).toHaveBeenCalledWith('admin_update_ambassador', { p_id: 'a1', p_name: 'Ana', p_code: 'ana', p_active: false });

    mockRpc.mockResolvedValue({ data: null, error: { message: 'user_not_found' } });
    await expect(createAmbassador({ email: 'x', name: '', code: 'abc' })).rejects.toThrow('Nenhuma conta com esse e-mail.');
  });
});

describe('influenciadores', () => {
  it('promove, lista e revisa programas', async () => {
    expect(influencerPageUrl('ana-fit')).toBe('https://eafit.com.br/i/?u=ana-fit');

    mockRpc.mockResolvedValue({ data: null, error: null });
    await setInfluencer('a1', true);
    expect(mockRpc).toHaveBeenCalledWith('admin_set_influencer', { p_ambassador: 'a1', p_on: true });

    mockRpc.mockResolvedValue({ data: [{ ip_id: 'p1', ip_ambassador: 'a1', ip_influencer: 'Ana', ip_code: 'ana', ip_status: 'review', ip_draft: { name: 'X' }, ip_published: null, ip_review_note: null, ip_hidden: false, ip_adoptions: '3', ip_updated_at: '2026-10-19' }], error: null });
    const [p] = await fetchInfluencerPrograms();
    expect(mockRpc).toHaveBeenCalledWith('admin_influencer_programs', { p_status: 'review' });
    expect(p).toMatchObject({ id: 'p1', code: 'ana', status: 'review', adoptions: 3, hidden: false });

    mockRpc.mockResolvedValue({ data: null, error: null });
    await reviewInfluencerProgram('p1', false, 'Volume alto');
    expect(mockRpc).toHaveBeenCalledWith('admin_review_influencer_program', { p_id: 'p1', p_approve: false, p_note: 'Volume alto' });

    mockRpc.mockResolvedValue({ data: null, error: { message: 'note_required' } });
    await expect(reviewInfluencerProgram('p1', false, '')).rejects.toThrow('Escreva o motivo da recusa');
  });
});
