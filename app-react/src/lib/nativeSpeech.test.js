import { describe, it, expect, vi, beforeEach } from 'vitest';

const plugin = vi.hoisted(() => ({ isLanguageSupported: vi.fn(), speak: vi.fn(), stop: vi.fn() }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => plugin }));

import { nativeSpeakAll, nativeStop, resetNativeSpeech } from './nativeSpeech';

beforeEach(() => {
  resetNativeSpeech();
  plugin.isLanguageSupported.mockReset().mockResolvedValue({ supported: true });
  plugin.speak.mockReset().mockResolvedValue(undefined);
  plugin.stop.mockReset().mockResolvedValue(undefined);
});

describe('nativeSpeech', () => {
  it('a primeira frase interrompe a fala atual e as outras entram na fila', async () => {
    const ok = await nativeSpeakAll([{ text: 'Boa!', rate: 1, pitch: 1 }, { text: 'Descansa.', rate: 0.98, pitch: 0.98 }], { volume: 0.8 });
    expect(ok).toBe(true);
    expect(plugin.speak).toHaveBeenCalledTimes(2);
    expect(plugin.speak.mock.calls[0][0]).toMatchObject({ text: 'Boa!', lang: 'pt-BR', queueStrategy: 0, volume: 0.8 });
    expect(plugin.speak.mock.calls[1][0]).toMatchObject({ text: 'Descansa.', queueStrategy: 1 });
  });

  it('com queue, todas entram na fila', async () => {
    await nativeSpeakAll([{ text: 'Oi', rate: 1, pitch: 1 }], { queue: true });
    expect(plugin.speak.mock.calls[0][0].queueStrategy).toBe(1);
  });

  it('plugin ausente no app ou idioma sem suporte: devolve false para cair na voz do navegador', async () => {
    plugin.isLanguageSupported.mockRejectedValue(new Error('"TextToSpeech" plugin is not implemented on android'));
    expect(await nativeSpeakAll([{ text: 'Oi', rate: 1, pitch: 1 }])).toBe(false);
    expect(plugin.speak).not.toHaveBeenCalled();
    resetNativeSpeech();
    plugin.isLanguageSupported.mockResolvedValue({ supported: false });
    expect(await nativeSpeakAll([{ text: 'Oi', rate: 1, pitch: 1 }])).toBe(false);
  });

  it('falha ao falar não estoura e parar não estoura sem o plugin', async () => {
    plugin.speak.mockRejectedValue(new Error('interrompida'));
    await expect(nativeSpeakAll([{ text: 'Oi', rate: 1, pitch: 1 }])).resolves.toBe(true);
    plugin.stop.mockRejectedValue(new Error('x'));
    expect(() => nativeStop()).not.toThrow();
  });
});
