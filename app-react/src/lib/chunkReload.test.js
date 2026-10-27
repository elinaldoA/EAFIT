import { describe, it, expect, vi } from 'vitest';
import { isChunkLoadError, importPage } from './chunkReload';

describe('isChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://x/a.js',
    "undefined is not an object (evaluating 'e._result.default')",
    "Cannot read properties of undefined (reading 'default')",
  ])('reconhece: %s', (msg) => {
    expect(isChunkLoadError(new TypeError(msg))).toBe(true);
  });

  it('ignora outros erros', () => {
    expect(isChunkLoadError(new Error('boom'))).toBe(false);
  });
});

describe('importPage', () => {
  it('tenta de novo quando o módulo vem vazio', async () => {
    const mod = { default: () => null };
    const loader = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(mod);
    expect(await importPage(loader)).toBe(mod);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('lança erro reconhecido se continuar vazio', async () => {
    const err = await importPage(() => Promise.resolve(undefined)).catch((e) => e);
    expect(isChunkLoadError(err)).toBe(true);
  });
});
