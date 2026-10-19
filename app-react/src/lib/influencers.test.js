// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc } }));

import {
  influencerPageUrl, programAppUrl, accentOf, levelLabel, programStatus, friendlyInfluencerError,
  captureProgramInvite, pendingProgramInvite, clearProgramInvite,
  fetchDirectory, adoptProgram, saveProgram, setFollowing, fetchMyInfluencer,
} from './influencers';

const ID = '94c55ac1-24c2-4f0c-804a-73a72f5cdee9';

beforeEach(() => {
  localStorage.clear();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
});

describe('links e rótulos', () => {
  it('página com crédito do link e link do app com o convite', () => {
    expect(influencerPageUrl('anafit')).toBe('https://eafit.com.br/i/?u=anafit&ref=anafit');
    expect(influencerPageUrl('anafit', ID)).toBe(`https://eafit.com.br/i/?u=anafit&ref=anafit&p=${ID}`);
    expect(programAppUrl('anafit', ID)).toBe(`https://eafit.com.br/app/?ref=anafit&programa=${ID}`);
  });

  it('cor só quando válida e nível pelo código', () => {
    expect(accentOf({ accent: '#ff3366' })).toBe('#ff3366');
    expect(accentOf({ accent: 'red' })).toBeNull();
    expect(accentOf(null)).toBeNull();
    expect(levelLabel('avancado')).toBe('Avançado');
    expect(levelLabel('x')).toBe('');
  });

  it('situação do programa, do rascunho ao ar', () => {
    expect(programStatus({ status: 'editing', live: false }).key).toBe('editing');
    expect(programStatus({ status: 'editing', live: true }).label).toBe('Edição não enviada');
    expect(programStatus({ status: 'review' }).key).toBe('review');
    expect(programStatus({ status: 'rejected' }).key).toBe('rejected');
    expect(programStatus({ status: 'approved', hidden: true }).key).toBe('hidden');
    expect(programStatus({ status: 'approved', hidden: false }).key).toBe('live');
  });

  it('erros do banco viram mensagem', () => {
    expect(friendlyInfluencerError({ message: 'invalid_exercises' })).toMatch(/1 a 20 exercícios/);
    expect(friendlyInfluencerError({ message: 'qualquer' })).toBe('Algo deu errado. Tente de novo.');
  });
});

describe('convite de programa (?programa=)', () => {
  it('guarda id válido por 7 dias e descarta o resto', () => {
    captureProgramInvite('?programa=nao-e-uuid');
    expect(pendingProgramInvite()).toBeNull();
    captureProgramInvite(`?ref=anafit&programa=${ID}`, 1000);
    expect(pendingProgramInvite(1000 + 6 * 86400000)).toBe(ID);
    expect(pendingProgramInvite(1000 + 8 * 86400000)).toBeNull();
    clearProgramInvite();
    expect(pendingProgramInvite(1000)).toBeNull();
  });
});

describe('chamadas', () => {
  it('usam as funções do banco com os parâmetros certos', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await fetchDirectory()).toEqual([]);
    expect(rpc).toHaveBeenCalledWith('influencers_directory', undefined);

    await adoptProgram(ID);
    expect(rpc).toHaveBeenLastCalledWith('adopt_influencer_program', { p_program: ID, p_start_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });

    await saveProgram(undefined, { name: 'X' });
    expect(rpc).toHaveBeenLastCalledWith('influencer_save_program', { p_id: null, p_program: { name: 'X' } });

    await setFollowing('anafit', false);
    expect(rpc).toHaveBeenLastCalledWith('influencer_follow', { p_code: 'anafit', p_follow: false });
  });

  it('propaga o erro do banco', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not_influencer' } });
    await expect(fetchMyInfluencer()).rejects.toMatchObject({ message: 'not_influencer' });
  });
});
