import { describe, it, expect, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('../../lib/supabase', () => ({ db: { rpc: (...a) => rpc(...a) } }));

import {
  fetchCommunityChallenges, fetchCommunityRanking, joinCommunityChallenge, communityStatus, communityDone, communityProgress,
  communityDaysLeft, formatCommunityAmount, communityGoalText, communityError,
} from './runsCommunity';

const base = { id: 'c1', title: '100 km', description: '', metric: 'km', goal: 100, start: '2026-11-01', end: '2026-11-30', members: 3, joined: true, value: 42.5, rank: 2 };

describe('desafios da comunidade', () => {
  it('lê os desafios do banco e converte os números', async () => {
    rpc.mockResolvedValueOnce({ data: [{
      rch_id: 'c1', rch_title: '100 km', rch_description: null, rch_metric: 'km', rch_goal: '100.0', rch_start: '2026-11-01',
      rch_end: '2026-11-30', rch_members: 3, rch_joined: true, rch_value: '42.5', rch_rank: 2,
    }, {
      rch_id: 'c2', rch_title: 'Horas', rch_description: 'x', rch_metric: 'hours', rch_goal: 10, rch_start: '2026-11-01',
      rch_end: '2026-11-30', rch_members: 0, rch_joined: false, rch_value: null, rch_rank: null,
    }], error: null });
    const list = await fetchCommunityChallenges();
    expect(rpc).toHaveBeenCalledWith('my_run_challenges');
    expect(list[0]).toMatchObject({ id: 'c1', goal: 100, value: 42.5, rank: 2, joined: true, description: '' });
    expect(list[1]).toMatchObject({ joined: false, value: null, rank: null });
  });

  it('propaga o erro do banco', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error('boom') });
    await expect(fetchCommunityChallenges()).rejects.toThrow('boom');
    rpc.mockResolvedValueOnce({ error: { message: 'challenge_ended' } });
    await expect(joinCommunityChallenge('c1')).rejects.toMatchObject({ message: 'challenge_ended' });
  });

  it('ranking vem no formato da tela', async () => {
    rpc.mockResolvedValueOnce({ data: [{ rcr_name: 'Ana', rcr_is_me: true, rcr_value: '30', rcr_rank: 1 }], error: null });
    expect(await fetchCommunityRanking('c1')).toEqual([{ name: 'Ana', isMe: true, value: 30, rank: 1 }]);
    expect(rpc).toHaveBeenLastCalledWith('run_challenge_ranking', { p_id: 'c1' });
  });

  it('situação pelo período', () => {
    expect(communityStatus(base, '2026-10-31')).toBe('upcoming');
    expect(communityStatus(base, '2026-11-01')).toBe('running');
    expect(communityStatus(base, '2026-11-30')).toBe('running');
    expect(communityStatus(base, '2026-12-01')).toBe('ended');
  });

  it('progresso fica entre 0 e 1 e conclui ao bater a meta', () => {
    expect(communityProgress(base)).toBeCloseTo(0.425);
    expect(communityProgress({ ...base, value: 250 })).toBe(1);
    expect(communityProgress({ ...base, value: null })).toBe(0);
    expect(communityDone(base)).toBe(false);
    expect(communityDone({ ...base, value: 100 })).toBe(true);
    expect(communityDone({ ...base, value: null })).toBe(false);
  });

  it('dias que faltam contam o último dia', () => {
    expect(communityDaysLeft(base, '2026-11-30')).toBe(1);
    expect(communityDaysLeft(base, '2026-11-28')).toBe(3);
    expect(communityDaysLeft(base, '2026-12-05')).toBe(0);
  });

  it('formata km, horas e corridas', () => {
    expect(formatCommunityAmount('km', 42.54)).toBe('42,5 km');
    expect(formatCommunityAmount('km', 100)).toBe('100 km');
    expect(formatCommunityAmount('hours', 3.5)).toBe('3 h 30 min');
    expect(formatCommunityAmount('hours', 10)).toBe('10 h');
    expect(formatCommunityAmount('hours', 0.25)).toBe('15 min');
    expect(formatCommunityAmount('runs', 7)).toBe('7');
    expect(communityGoalText(base)).toBe('Meta: 100 km');
    expect(communityGoalText({ ...base, metric: 'runs', goal: 12 })).toBe('Meta: 12 corridas');
  });

  it('mensagens de erro em português', () => {
    expect(communityError({ message: 'challenge_ended' })).toBe('Esse desafio já terminou.');
    expect(communityError({ message: 'not_found' })).toBe('Desafio não encontrado.');
    expect(communityError({ message: 'qualquer coisa' })).toContain('tente de novo');
  });
});
