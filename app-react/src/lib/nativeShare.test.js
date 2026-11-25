// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const share = vi.hoisted(() => ({ share: vi.fn() }));
const fs = vi.hoisted(() => ({ writeFile: vi.fn() }));
const native = vi.hoisted(() => ({ on: true }));
vi.mock('@capacitor/share', () => ({ Share: share }));
vi.mock('@capacitor/filesystem', () => ({ Filesystem: fs, Directory: { Cache: 'CACHE' } }));
vi.mock('./native', () => ({ isNative: () => native.on }));

import { nativeShare, installNativeShare } from './nativeShare';

beforeEach(() => {
  native.on = true;
  share.share.mockReset().mockResolvedValue({});
  fs.writeFile.mockReset().mockResolvedValue({ uri: 'file:///cache/share/a.png' });
});

describe('nativeShare', () => {
  it('texto e link vão direto para a folha de compartilhar', async () => {
    await nativeShare({ title: 'EAFIT', text: 'oi', url: 'https://eafit.app' });
    expect(share.share).toHaveBeenCalledWith(expect.objectContaining({ text: 'oi', url: 'https://eafit.app', files: undefined }));
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('arquivo é gravado no cache e compartilhado pelo uri, sem url', async () => {
    const file = new File(['abc'], 'a.png', { type: 'image/png' });
    await nativeShare({ files: [file], text: 't', url: 'https://x' });
    expect(fs.writeFile).toHaveBeenCalledWith(expect.objectContaining({ path: 'share/a.png', data: 'YWJj', directory: 'CACHE' }));
    expect(share.share).toHaveBeenCalledWith(expect.objectContaining({ files: ['file:///cache/share/a.png'], url: undefined }));
  });

  it('fechar a folha vira AbortError, como na Web Share API', async () => {
    share.share.mockRejectedValue(new Error('Share canceled'));
    await expect(nativeShare({ text: 'x' })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('outros erros passam adiante', async () => {
    share.share.mockRejectedValue(new Error('boom'));
    await expect(nativeShare({ text: 'x' })).rejects.toThrow('boom');
  });
});

describe('installNativeShare', () => {
  it('no app define navigator.share e canShare', () => {
    installNativeShare();
    expect(navigator.share).toBe(nativeShare);
    expect(navigator.canShare({ files: [new File(['a'], 'a.png')] })).toBe(true);
    expect(navigator.canShare({})).toBe(false);
  });

  it('no navegador não mexe em nada', () => {
    native.on = false;
    const before = navigator.share;
    installNativeShare();
    expect(navigator.share).toBe(before);
  });
});
