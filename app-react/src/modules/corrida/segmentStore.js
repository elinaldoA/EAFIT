import { db } from '../../lib/supabase';
import { trackFeature } from '../../lib/tracking';
import { newEfforts } from './segmentMatch';

// Segmentos no banco (migration 20270305170000): listar, criar, apagar, mudar quem
// vê, gravar os esforços e ler o placar. Sem as tabelas tudo devolve vazio.

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

const cleanPoints = route => (Array.isArray(route)
  ? route.filter(p => Array.isArray(p) && p.length >= 2 && p.every(Number.isFinite)).map(p => [p[0], p[1]])
  : []);

// Segmentos que a pessoa pode usar (os dela e os dos amigos): [{ id, name, route, distance_m,
// visibility, isMine, owner }].
export async function fetchSegments() {
  let result;
  try { result = await db.rpc('my_segments'); } catch { return []; }
  const { data, error } = result || {};
  if (error) return [];
  return (data || [])
    .map(r => ({
      id: r.sg_id, name: String(r.sg_name || ''), route: cleanPoints(r.sg_route), distance_m: num(r.sg_distance_m),
      visibility: r.sg_visibility === 'amigos' ? 'amigos' : 'privado', isMine: !!r.sg_is_mine, owner: r.sg_owner || null,
    }))
    .filter(s => s.id && s.route.length >= 2);
}

// Cria o segmento (privado). { route, distance_m } vem de segmentMatch.segmentFromRun.
export async function createSegment(userId, { name, route, distance_m }) {
  trackFeature('run_segment');
  const { data, error } = await db
    .from('segments')
    .insert({ user_id: userId, name: String(name || '').trim().slice(0, 60), route, distance_m })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function deleteSegment(userId, id) {
  const { error } = await db.from('segments').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

export async function setSegmentVisibility(userId, id, visibility) {
  const { error } = await db.from('segments').update({ visibility: visibility === 'amigos' ? 'amigos' : 'privado' }).eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

// Esforços da pessoa: Set de "segmento:corrida" já gravados e o melhor tempo por segmento.
export async function fetchMyEfforts(userId) {
  const { data, error } = await db.from('segment_efforts').select('segment_id, run_id, seconds, run_date').eq('user_id', userId);
  if (error) return { known: new Set(), best: new Map() };
  const known = new Set();
  const best = new Map();
  for (const e of data || []) {
    known.add(`${e.segment_id}:${e.run_id}`);
    const cur = best.get(e.segment_id);
    if (!cur || e.seconds < cur.seconds) best.set(e.segment_id, { seconds: e.seconds, run_date: e.run_date });
  }
  return { known, best };
}

// Calcula os esforços que faltam (corridas × segmentos) e grava. Devolve quantos novos.
export async function syncEfforts(userId, segments, runs, known) {
  const fresh = newEfforts(segments, runs, known).map(e => ({ ...e, user_id: userId }));
  if (!fresh.length) return 0;
  const { error } = await db.from('segment_efforts').upsert(fresh, { onConflict: 'segment_id,run_id', ignoreDuplicates: true });
  if (error) throw error;
  return fresh.length;
}

// Placar do segmento: [{ name, isMe, seconds, date, rank }].
export async function fetchLeaderboard(segmentId) {
  const { data, error } = await db.rpc('segment_leaderboard', { p_segment: segmentId });
  if (error) return [];
  return (data || []).map(r => ({ name: r.sl_name || null, isMe: !!r.sl_is_me, seconds: num(r.sl_seconds), date: r.sl_date, rank: num(r.sl_rank) }));
}
