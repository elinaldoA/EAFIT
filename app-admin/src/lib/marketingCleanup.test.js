import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));
vi.mock('./reelRender', () => ({ drawPhone: vi.fn() }));

import { unusedMedia, removeMediaBatch } from './marketing';

const item = (id, path) => ({ id, storage_path: path });

describe('unusedMedia (limpeza da biblioteca)', () => {
  const urls = [
    'https://x.supabase.co/storage/v1/object/public/marketing-media/111-reels-a.mp4',
    'https://eafit.com.br/img/marketing/story-cafe-6.mp4',
  ];

  it('mantém o que um post da fila ainda usa e devolve o resto', () => {
    const items = [item(1, '111-reels-a.mp4'), item(2, '222-post-velho.jpg'), item(3, '333-outro.png')];
    expect(unusedMedia(items, urls).map(m => m.id)).toEqual([2, 3]);
  });

  it('sem nenhum post ativo, tudo está sem uso; sem itens, nada a remover', () => {
    expect(unusedMedia([item(1, 'a.jpg')], [])).toHaveLength(1);
    expect(unusedMedia([], urls)).toEqual([]);
    expect(unusedMedia(null, urls)).toEqual([]);
  });

  it('ignora item sem caminho de arquivo (nunca remove às cegas)', () => {
    expect(unusedMedia([{ id: 9, storage_path: '' }], [])).toEqual([]);
  });
});

describe('removeMediaBatch', () => {
  it('remove todos e conta', async () => {
    const remove = vi.fn().mockResolvedValue();
    const out = await removeMediaBatch([item(1, 'a'), item(2, 'b')], remove);
    expect(out).toEqual({ done: 2, failed: [] });
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it('um que falha não derruba os outros e vem listado', async () => {
    const remove = vi.fn()
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error('rls'))
      .mockResolvedValueOnce();
    const out = await removeMediaBatch([item(1, 'a'), item(2, 'b'), item(3, 'c')], remove);
    expect(out.done).toBe(2);
    expect(out.failed).toEqual([{ item: item(2, 'b'), message: 'rls' }]);
  });
});
