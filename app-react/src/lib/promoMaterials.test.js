// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({ createSignedUrl: vi.fn() }));
vi.mock('./supabase', () => ({ db: { storage: { from: () => ({ createSignedUrl: h.createSignedUrl }) } } }));

import { downloadPromoMaterial, formatSize, materialIcon } from './promoMaterials';

describe('promoMaterials', () => {
  it('ícone pelo tipo do arquivo', () => {
    expect(materialIcon('image/png')).toBe('🖼️');
    expect(materialIcon('video/mp4')).toBe('🎬');
    expect(materialIcon('application/pdf')).toBe('📄');
    expect(materialIcon('application/zip')).toBe('📦');
  });

  it('tamanho em KB ou MB', () => {
    expect(formatSize(300)).toBe('1 KB');
    expect(formatSize(500 * 1024)).toBe('500 KB');
    expect(formatSize(12 * 1024 * 1024)).toBe('12 MB');
  });

  it('baixa por URL assinada com o nome original', async () => {
    h.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://x/assinada' }, error: null });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await downloadPromoMaterial({ storage_path: 'a/logo.png', file_name: 'logo.png' });
    expect(h.createSignedUrl).toHaveBeenCalledWith('a/logo.png', 300, { download: 'logo.png' });
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });
});
