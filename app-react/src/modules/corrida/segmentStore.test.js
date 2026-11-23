// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ rpc: { data: [], error: null }, table: { data: [], error: null }, calls: [], single: { data: { id: 's1' }, error: null } }));
vi.mock('../../lib/supabase', () => {
  const chain = () => {
    const q = {};
    ['select', 'eq', 'delete', 'update'].forEach(m => { q[m] = (...a) => { h.calls.push([m, ...a]); return q; }; });
    q.insert = row => { h.calls.push(['insert', row]); return q; };
    q.upsert = (rows, opts) => { h.calls.push(['upsert', rows, opts]); return Promise.resolve(h.table); };
    q.single = () => Promise.resolve(h.single);
    q.then = (res, rej) => Promise.resolve(h.table).then(res, rej);
    return q;
  };
  return { db: { from: () => chain(), rpc: (name, args) => { h.calls.push(['rpc', name, args]); return Promise.resolve(h.rpc); } } };
});
vi.mock('../../lib/tracking', () => ({ trackFeature: () => {} }));

import { fetchSegments, createSegment, fetchMyEfforts, syncEfforts, fetchLeaderboard } from './segmentStore';

const line = n => [Array.from({ length: n }, (_, i) => [-2355000 + i * 10, -4665000, i * 10])];
beforeEach(() => { h.rpc = { data: [], error: null }; h.table = { data: [], error: null }; h.calls = []; });

describe('segmentos no banco', () => {
  it('lista os segmentos válidos e sem as tabelas devolve vazio', async () => {
    h.rpc = { error: null, data: [
      { sg_id: 'a', sg_name: 'Ponte', sg_route: [[1, 2], [3, 4]], sg_distance_m: 500, sg_visibility: 'amigos', sg_is_mine: true },
      { sg_id: 'b', sg_name: 'Ruim', sg_route: [[1, 2]], sg_distance_m: 5, sg_visibility: 'privado', sg_is_mine: false, sg_owner: 'Bia' },
    ] };
    const list = await fetchSegments();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'a', visibility: 'amigos', isMine: true, distance_m: 500 });
    h.rpc = { data: null, error: { message: 'function does not exist' } };
    expect(await fetchSegments()).toEqual([]);
  });
  it('cria o segmento privado com o nome aparado', async () => {
    const id = await createSegment('u1', { name: '  Subida  ', route: [[1, 1], [2, 2]], distance_m: 300 });
    expect(id).toBe('s1');
    expect(h.calls.find(c => c[0] === 'insert')[1]).toMatchObject({ user_id: 'u1', name: 'Subida', distance_m: 300 });
  });
  it('melhor tempo por segmento e esforços já conhecidos', async () => {
    h.table = { error: null, data: [
      { segment_id: 'a', run_id: 'r1', seconds: 300, run_date: '2026-11-01' },
      { segment_id: 'a', run_id: 'r2', seconds: 280, run_date: '2026-11-08' },
    ] };
    const { known, best } = await fetchMyEfforts('u1');
    expect(known.has('a:r1')).toBe(true);
    expect(best.get('a')).toEqual({ seconds: 280, run_date: '2026-11-08' });
  });
  it('grava só os esforços novos (sem repetir os que já existem)', async () => {
    const run = { id: 'r1', run_date: '2026-11-17', route: line(101) };
    const seg = { id: 's1', route: [[-2354800, -4665000], [-2354300, -4665000]], distance_m: 556 };
    // o segmento acima pega ~556 m no meio do percurso da corrida
    const n = await syncEfforts('u1', [seg], [run], new Set());
    expect(n).toBe(1);
    const up = h.calls.find(c => c[0] === 'upsert');
    expect(up[1][0]).toMatchObject({ segment_id: 's1', run_id: 'r1', user_id: 'u1' });
    expect(await syncEfforts('u1', [seg], [run], new Set(['s1:r1']))).toBe(0);
  });
  it('placar: nome, posição e quem é a própria pessoa', async () => {
    h.rpc = { error: null, data: [{ sl_name: null, sl_is_me: true, sl_seconds: 280, sl_date: '2026-11-08', sl_rank: 1 }, { sl_name: 'Bia', sl_is_me: false, sl_seconds: 290, sl_date: '2026-11-02', sl_rank: 2 }] };
    expect(await fetchLeaderboard('s1')).toEqual([
      { name: null, isMe: true, seconds: 280, date: '2026-11-08', rank: 1 },
      { name: 'Bia', isMe: false, seconds: 290, date: '2026-11-02', rank: 2 },
    ]);
  });
});
