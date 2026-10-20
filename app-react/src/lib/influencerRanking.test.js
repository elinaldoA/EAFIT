import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('./supabase', () => ({ db: { rpc: (...a) => h.rpc(...a) } }));

import { fetchInfluencerRanking, setRankingPublic, rankingView } from './influencerRanking';

beforeEach(() => h.rpc.mockReset());

const row = (position, me = false) => ({ position, name: null, signups: 20 - position, me, public: false });

describe('influencerRanking', () => {
  it('converte as linhas do banco', async () => {
    h.rpc.mockResolvedValue({ data: [{ rk_position: '1', rk_name: null, rk_signups: '5', rk_me: true, rk_public: false }], error: null });
    expect(await fetchInfluencerRanking(1)).toEqual([{ position: 1, name: null, signups: 5, me: true, public: false }]);
    expect(h.rpc).toHaveBeenCalledWith('influencer_ranking', { p_month_offset: 1 });
  });

  it('salva a escolha do nome', async () => {
    h.rpc.mockResolvedValue({ error: null });
    await setRankingPublic(true);
    expect(h.rpc).toHaveBeenCalledWith('set_my_ranking_public', { p_public: true });
  });

  it('top 10 e a própria linha no fim quando ficou de fora', () => {
    const rows = Array.from({ length: 14 }, (_, i) => row(i + 1, i === 12));
    const v = rankingView(rows);
    expect(v.head).toHaveLength(10);
    expect(v.meOutside.position).toBe(13);
    expect(v.total).toBe(14);
  });

  it('quem está no top não é repetido', () => {
    const rows = [row(1), row(2, true), row(3)];
    expect(rankingView(rows).meOutside).toBeNull();
    expect(rankingView(rows).me.position).toBe(2);
  });
});
