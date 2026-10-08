import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: mockRpc } }));

import {
  todayStr, addDaysStr, formatDay, challengeStatus, validateOfficialChallenge, participationPct,
  friendlyCommunityError, fetchChallenges, fetchChallengeLeaderboard, createOfficialChallenge, deleteChallenge,
  fetchSocialStats, fetchFeedEvents, deleteFeedEvent, setFeedBlock, fetchInviteFunnel,
} from './community';

beforeEach(() => vi.clearAllMocks());

describe('datas', () => {
  it('todayStr usa o fuso de São Paulo', () => {
    // 01:00 UTC ainda é o dia anterior em São Paulo (UTC-3)
    expect(todayStr(new Date('2026-10-08T01:00:00Z'))).toBe('2026-10-07');
    expect(todayStr(new Date('2026-10-08T15:00:00Z'))).toBe('2026-10-08');
  });

  it('addDaysStr atravessa mês e ano', () => {
    expect(addDaysStr('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDaysStr('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('formatDay', () => {
    expect(formatDay('2026-10-08')).toBe('08/10/2026');
    expect(formatDay(null)).toBe('—');
  });
});

describe('challengeStatus', () => {
  const c = { start: '2026-10-05', end: '2026-10-11' };
  it('futuro, ativo (inclusive nas pontas) e encerrado', () => {
    expect(challengeStatus(c, '2026-10-04')).toBe('futuro');
    expect(challengeStatus(c, '2026-10-05')).toBe('ativo');
    expect(challengeStatus(c, '2026-10-11')).toBe('ativo');
    expect(challengeStatus(c, '2026-10-12')).toBe('encerrado');
  });
});

describe('validateOfficialChallenge', () => {
  it('apara o nome e calcula o fim pela duração (início conta como dia 1)', () => {
    expect(validateOfficialChallenge('  Outubro  ', '2026-10-01', 7))
      .toEqual({ ok: true, title: 'Outubro', start: '2026-10-01', end: '2026-10-07' });
  });

  it('recusa nome curto ou longo, data ausente e duração fora do limite', () => {
    expect(validateOfficialChallenge('ab', '2026-10-01', 7).ok).toBe(false);
    expect(validateOfficialChallenge('x'.repeat(51), '2026-10-01', 7).ok).toBe(false);
    expect(validateOfficialChallenge('Outubro', '', 7).ok).toBe(false);
    expect(validateOfficialChallenge('Outubro', '2026-10-01', 61).ok).toBe(false);
    expect(validateOfficialChallenge('Outubro', '2026-10-01', 0).ok).toBe(false);
  });
});

describe('participationPct', () => {
  it('percentual inteiro; sem participantes não há percentual', () => {
    expect(participationPct(8, 2)).toBe(25);
    expect(participationPct(0, 0)).toBeNull();
  });
});

describe('friendlyCommunityError', () => {
  it('traduz códigos conhecidos e mantém a mensagem desconhecida', () => {
    expect(friendlyCommunityError(new Error('invalid_period'))).toMatch(/Período inválido/);
    expect(friendlyCommunityError(new Error('not_found'))).toMatch(/não existe mais/);
    expect(friendlyCommunityError(new Error('outra coisa'))).toBe('outra coisa');
    expect(friendlyCommunityError(null)).toBe('Não foi possível concluir.');
  });
});

describe('chamadas', () => {
  it('fetchChallenges mapeia as colunas ac_*', async () => {
    mockRpc.mockResolvedValue({
      data: [{ ac_id: 'c1', ac_title: 'Out', ac_code: 'ABC123', ac_start: '2026-10-01', ac_end: '2026-10-07', ac_official: true, ac_owner: null, ac_owner_email: null, ac_members: '12', ac_active: '5', ac_created: 't' }],
      error: null,
    });
    expect(await fetchChallenges()).toEqual([{
      id: 'c1', title: 'Out', code: 'ABC123', start: '2026-10-01', end: '2026-10-07', official: true,
      ownerId: null, ownerEmail: null, members: 12, active: 5, createdAt: 't',
    }]);
    expect(mockRpc).toHaveBeenCalledWith('admin_list_challenges', undefined);
  });

  it('fetchChallengeLeaderboard, createOfficialChallenge e deleteChallenge', async () => {
    mockRpc.mockResolvedValueOnce({ data: [{ al_user: 'u1', al_email: 'a@x.com', al_name: 'Ana', al_role: 'member', al_score: '4' }], error: null });
    expect(await fetchChallengeLeaderboard('c1')).toEqual([{ userId: 'u1', email: 'a@x.com', name: 'Ana', role: 'member', score: 4 }]);
    expect(mockRpc).toHaveBeenLastCalledWith('admin_challenge_leaderboard', { p_id: 'c1' });

    mockRpc.mockResolvedValueOnce({ data: 'XYZ789', error: null });
    expect(await createOfficialChallenge('Out', '2026-10-01', '2026-10-07')).toBe('XYZ789');
    expect(mockRpc).toHaveBeenLastCalledWith('admin_create_official_challenge', { p_title: 'Out', p_start: '2026-10-01', p_end: '2026-10-07' });

    mockRpc.mockResolvedValueOnce({ error: null });
    await deleteChallenge('c1');
    expect(mockRpc).toHaveBeenLastCalledWith('admin_delete_challenge', { p_id: 'c1' });
  });

  it('propaga o erro da RPC', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('not_authorized') });
    await expect(fetchChallenges()).rejects.toThrow('not_authorized');
    await expect(deleteChallenge('c1')).rejects.toThrow('not_authorized');
    await expect(createOfficialChallenge('a', 'b', 'c')).rejects.toThrow('not_authorized');
  });

  it('fetchSocialStats converte para número e devolve null sem linha', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ ss_users: '10', ss_with_friends: '4', ss_friendships: '3', ss_pending: '1', ss_sharing_off: '2', ss_blocked: '0', ss_events_7d: '9', ss_events_30d: '20', ss_reactions_30d: '7', ss_challenges_active: '1', ss_challenge_users: '5' }],
      error: null,
    });
    expect(await fetchSocialStats()).toEqual({
      users: 10, withFriends: 4, friendships: 3, pending: 1, sharingOff: 2, blocked: 0,
      events7d: 9, events30d: 20, reactions30d: 7, challengesActive: 1, challengeUsers: 5,
    });
    mockRpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await fetchSocialStats()).toBeNull();
  });

  it('fetchFeedEvents pagina, filtra por tipo e lê o total da primeira linha', async () => {
    mockRpc.mockResolvedValue({
      data: [{ fe_id: 7, fe_user: 'u1', fe_email: 'a@x.com', fe_kind: 'treino', fe_title: 'Peito', fe_detail: null, fe_at: 't', fe_reactions: '2', fe_blocked: false, total_count: '120' }],
      error: null,
    });
    const res = await fetchFeedEvents({ page: 2, kind: 'treino' });
    expect(mockRpc).toHaveBeenCalledWith('admin_feed_events', { page_size: 50, page_offset: 100, only_kind: 'treino' });
    expect(res.total).toBe(120);
    expect(res.rows[0]).toEqual({ id: 7, userId: 'u1', email: 'a@x.com', kind: 'treino', title: 'Peito', detail: null, at: 't', reactions: 2, blocked: false });

    mockRpc.mockResolvedValue({ data: [], error: null });
    expect(await fetchFeedEvents()).toEqual({ total: 0, rows: [] });
    expect(mockRpc).toHaveBeenLastCalledWith('admin_feed_events', { page_size: 50, page_offset: 0, only_kind: null });
  });

  it('deleteFeedEvent, setFeedBlock e fetchInviteFunnel', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await deleteFeedEvent(7);
    expect(mockRpc).toHaveBeenLastCalledWith('admin_delete_feed_event', { p_id: 7 });
    await setFeedBlock('u1', true);
    expect(mockRpc).toHaveBeenLastCalledWith('admin_set_feed_block', { p_user: 'u1', p_blocked: true });

    mockRpc.mockResolvedValue({ data: [{ if_share_users: '3', if_share_days: '5', if_landing: '8', if_acesso: '4', if_signups: '6' }], error: null });
    expect(await fetchInviteFunnel(7)).toEqual({ shareUsers: 3, shareDays: 5, landing: 8, acesso: 4, signups: 6 });
    expect(mockRpc).toHaveBeenLastCalledWith('admin_invite_funnel', { days_back: 7 });
  });
});
