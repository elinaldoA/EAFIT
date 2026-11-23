// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  table: { data: [], error: null },
  insert: { data: { id: 'p1' }, error: null },
  upload: { error: null },
  signed: { data: [], error: null },
  removed: [],
  calls: [],
}));

vi.mock('../../lib/supabase', () => {
  const chain = () => {
    const q = {};
    ['select', 'in', 'order', 'eq', 'delete'].forEach(m => { q[m] = (...a) => { h.calls.push([m, ...a]); return q; }; });
    q.insert = row => { h.calls.push(['insert', row]); return q; };
    q.single = () => Promise.resolve(h.insert);
    q.then = (res, rej) => Promise.resolve(h.table).then(res, rej);
    return q;
  };
  return {
    db: {
      from: () => chain(),
      storage: {
        from: () => ({
          upload: async (...a) => { h.calls.push(['upload', ...a]); return h.upload; },
          remove: async p => { h.removed.push(...p); return {}; },
          createSignedUrls: async () => h.signed,
        }),
      },
    },
  };
});
vi.mock('../../lib/imageUtils', () => ({ compressImageBlob: async f => f, assertValidImage: () => {} }));
vi.mock('../../lib/tracking', () => ({ trackFeature: () => {} }));

import { fetchRunPhotos, signPhotoUrls, addRunPhoto, deleteRunPhoto, isPhotoLimit } from './runPhotoStore';

beforeEach(() => {
  h.table = { data: [], error: null };
  h.insert = { data: { id: 'p1' }, error: null };
  h.upload = { error: null };
  h.signed = { data: [], error: null };
  h.removed = [];
  h.calls = [];
});

describe('fotos da corrida', () => {
  it('agrupa as fotos por corrida e, sem a tabela, devolve vazio', async () => {
    h.table = { data: [{ id: 'a', run_id: 'r1', storage_path: 'u/r1/a.jpg' }, { id: 'b', run_id: 'r1', storage_path: 'u/r1/b.jpg' }, { id: 'c', run_id: 'r2', storage_path: 'u/r2/c.jpg' }], error: null };
    const m = await fetchRunPhotos(['r1', 'r2', 'r1', null]);
    expect(m.get('r1')).toEqual([{ id: 'a', path: 'u/r1/a.jpg' }, { id: 'b', path: 'u/r1/b.jpg' }]);
    expect(m.get('r2')).toHaveLength(1);
    h.table = { data: null, error: { message: 'relation does not exist' } };
    expect((await fetchRunPhotos(['r1'])).size).toBe(0);
    expect((await fetchRunPhotos([])).size).toBe(0);
  });

  it('links assinados por caminho; foto sem permissão fica de fora', async () => {
    h.signed = { data: [{ path: 'a', signedUrl: 'https://x/a' }, { path: 'b', signedUrl: null }], error: null };
    expect(await signPhotoUrls(['a', 'b', 'a'])).toEqual({ a: 'https://x/a' });
    expect(await signPhotoUrls([])).toEqual({});
  });

  it('envia o arquivo na pasta dono/corrida e registra na tabela', async () => {
    const out = await addRunPhoto('u1', { id: 'r1' }, new Blob(['x']));
    expect(out.id).toBe('p1');
    expect(out.path).toMatch(/^u1\/r1\/.+\.jpg$/);
    expect(h.calls.find(c => c[0] === 'insert')[1]).toMatchObject({ user_id: 'u1', run_id: 'r1', storage_path: out.path });
  });

  it('corrida ainda na fila do aparelho (sem id) não aceita foto', async () => {
    await expect(addRunPhoto('u1', { client_id: 'c' }, new Blob(['x']))).rejects.toThrow('run_not_saved');
  });

  it('se o registro falha (limite de 4), o arquivo enviado é removido', async () => {
    h.insert = { data: null, error: { message: 'run_photos_max' } };
    await expect(addRunPhoto('u1', { id: 'r1' }, new Blob(['x']))).rejects.toMatchObject({ message: 'run_photos_max' });
    expect(h.removed).toHaveLength(1);
    expect(isPhotoLimit({ message: 'run_photos_max' })).toBe(true);
    expect(isPhotoLimit({ message: 'outro' })).toBe(false);
  });

  it('apagar tira a linha e o arquivo', async () => {
    h.table = { data: null, error: null };
    await deleteRunPhoto('u1', { id: 'p1', path: 'u1/r1/a.jpg' });
    expect(h.removed).toEqual(['u1/r1/a.jpg']);
  });
});
