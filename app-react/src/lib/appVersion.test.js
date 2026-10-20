// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { compareVersions, hardUpdate, isOutdated } from './appVersion';
import { normalizeConfig } from './appConfig';

vi.mock('./supabase', () => ({ db: {} }));

describe('appVersion', () => {
  it('compara por partes numéricas', () => {
    expect(compareVersions('1.4.10', '1.4.2')).toBe(1);
    expect(compareVersions('0.3', '0.3.0')).toBe(0);
    expect(compareVersions('0.2.9', '0.3.0')).toBe(-1);
    expect(isOutdated('0.4.0', '0.3.4')).toBe(true);
    expect(isOutdated('0.3.4', '0.3.4')).toBe(false);
    expect(isOutdated('', '0.0.1')).toBe(false);
  });

  it('a configuração aceita só versões no formato x.y.z e modo block/warn', () => {
    expect(normalizeConfig([{ key: 'min_version', value: { version: '0.4.0', mode: 'block', message: ' Atualize ' } }]).minVersion)
      .toEqual({ version: '0.4.0', mode: 'block', message: 'Atualize' });
    expect(normalizeConfig([{ key: 'min_version', value: { version: 'v1', mode: 'x' } }]).minVersion)
      .toEqual({ version: '', mode: 'warn', message: '' });
  });

  it('hardUpdate tira o service worker e os caches e recarrega', async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    const del = vi.fn().mockResolvedValue(true);
    const reload = vi.fn();
    await hardUpdate({
      navigator: { serviceWorker: { getRegistrations: async () => [{ unregister }] } },
      caches: { keys: async () => ['a', 'b'], delete: del },
      location: { reload },
    });
    expect(unregister).toHaveBeenCalled();
    expect(del).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalled();
  });
});
