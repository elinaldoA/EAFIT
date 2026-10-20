import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc, mockInvoke } = vi.hoisted(() => ({ mockRpc: vi.fn(), mockInvoke: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: mockRpc, functions: { invoke: mockInvoke } } }));

import {
  ambassadorLink, suggestCode, isValidCode, conversion, ambassadorError,
  fetchAmbassadors, fetchReferrals, fetchUserAmbassador, createAmbassador, updateAmbassador, sendInfluencerMessage,
} from './ambassadors';

beforeEach(() => { mockRpc.mockReset(); });

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
    expect(a).toMatchObject({ id: 'a1', code: 'ana', kind: 'embaixador', visits: 10, signups: 2, total: 5, active7: 1 });

    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await fetchReferrals('a1')).toEqual([]);
    expect(mockRpc).toHaveBeenCalledWith('admin_ambassador_referrals', { p_ambassador: 'a1' });
    expect(await fetchUserAmbassador('u2')).toBeNull();
  });

  it('criar e editar normalizam o código e propagam o erro traduzido', async () => {
    mockRpc.mockResolvedValue({ data: 'id', error: null });
    await createAmbassador({ email: ' a@x ', name: ' Ana ', code: ' AnaFit ' });
    expect(mockRpc).toHaveBeenCalledWith('admin_create_ambassador', { p_email: 'a@x', p_name: 'Ana', p_code: 'anafit', p_kind: 'embaixador' });
    await updateAmbassador({ id: 'a1', name: 'Ana', code: 'ana', active: false });
    expect(mockRpc).toHaveBeenCalledWith('admin_update_ambassador', { p_id: 'a1', p_name: 'Ana', p_code: 'ana', p_active: false, p_kind: null });
    await updateAmbassador({ id: 'a1', name: 'Ana', code: 'ana', active: true, kind: 'influenciador' });
    expect(mockRpc).toHaveBeenCalledWith('admin_update_ambassador', { p_id: 'a1', p_name: 'Ana', p_code: 'ana', p_active: true, p_kind: 'influenciador' });

    await createAmbassador({ email: 'b@x', name: 'Bia', code: 'bia', kind: 'influenciador' });
    expect(mockRpc).toHaveBeenCalledWith('admin_create_ambassador', { p_email: 'b@x', p_name: 'Bia', p_code: 'bia', p_kind: 'influenciador' });

    mockRpc.mockResolvedValue({ data: null, error: { message: 'user_not_found' } });
    await expect(createAmbassador({ email: 'x', name: '', code: 'abc' })).rejects.toThrow('Nenhuma conta com esse e-mail.');
  });
});

describe('sendInfluencerMessage', () => {
  it('manda para o público de influenciadores (a lista sai do servidor)', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, recipients: 3, sent: 2 }, error: null });
    await expect(sendInfluencerMessage({ title: ' Campanha ', body: ' Poste até sexta ' })).resolves.toEqual({ recipients: 3, sent: 2 });
    expect(mockInvoke).toHaveBeenCalledWith('admin-broadcast', {
      body: { title: 'Campanha', body: 'Poste até sexta', audience: 'influenciadores' },
    });
  });

  it('repassa o erro do servidor', async () => {
    mockInvoke.mockResolvedValue({ data: { error: 'Nenhum influenciador ativo.' }, error: null });
    await expect(sendInfluencerMessage({ title: 'a', body: 'b' })).rejects.toThrow('Nenhum influenciador ativo.');
  });
});
