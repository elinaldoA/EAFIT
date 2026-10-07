import { describe, it, expect, vi, afterEach } from 'vitest';
import { pickVoice, voiceGender, isVoiceSupported, speak, cancelSpeech, listPtVoices } from './voice';

const v = (name, lang = 'pt-BR', localService = true) => ({ name, lang, localService });

afterEach(() => { vi.unstubAllGlobals(); });

describe('voiceGender', () => {
  it('reconhece vozes comuns pelo nome', () => {
    expect(voiceGender(v('Microsoft Francisca Online (Natural)'))).toBe('female');
    expect(voiceGender(v('Luciana'))).toBe('female');
    expect(voiceGender(v('Google português do Brasil'))).toBe('female');
    expect(voiceGender(v('Microsoft Antonio Online (Natural)'))).toBe('male');
    expect(voiceGender(v('Felipe'))).toBe('male');
    expect(voiceGender(v('Voz Desconhecida'))).toBeNull();
    expect(voiceGender(undefined)).toBeNull();
  });
});

describe('pickVoice', () => {
  const voices = [
    v('Daniel', 'pt-BR'),
    v('Microsoft Antonio Online (Natural)', 'pt-BR', false),
    v('Luciana', 'pt-BR'),
    v('Joana', 'pt-PT'),
    v('Samantha', 'en-US'),
  ];

  it('sem escolha, usa a melhor voz pt-BR: natural/neural primeiro', () => {
    expect(pickVoice(voices).name).toBe('Microsoft Antonio Online (Natural)');
    expect(pickVoice([v('Luciana'), v('Microsoft Francisca Online (Natural)', 'pt-BR', false)]).name)
      .toBe('Microsoft Francisca Online (Natural)');
  });

  it('ignora vozes fora do português', () => {
    expect(pickVoice([v('Samantha', 'en-US')])).toBeNull();
    expect(pickVoice([])).toBeNull();
    expect(pickVoice(undefined)).toBeNull();
  });

  it('prefere pt-BR a pt-PT', () => {
    expect(pickVoice([v('Joana', 'pt-PT'), v('Daniel')]).name).toBe('Daniel');
  });

  it('voz escolhida à mão vale sobre a automática; nome inexistente é ignorado', () => {
    expect(pickVoice(voices, 'Luciana').name).toBe('Luciana');
    expect(pickVoice(voices, 'Não existe').name).toBe('Microsoft Antonio Online (Natural)');
  });

  it('aceita lang com underscore (Android)', () => {
    expect(pickVoice([v('Google português do Brasil', 'pt_BR')]).name).toBe('Google português do Brasil');
  });
});

describe('speak', () => {
  function stubSynth(voices) {
    const synth = {
      getVoices: () => voices, speak: vi.fn(), cancel: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    };
    vi.stubGlobal('window', { speechSynthesis: synth });
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(text) { this.text = text; } });
    return synth;
  }

  it('sem suporte não fala', async () => {
    vi.stubGlobal('window', {});
    expect(isVoiceSupported()).toBe(false);
    expect(await speak('oi')).toBe(false);
    expect(() => cancelSpeech()).not.toThrow();
  });

  it('fala com a melhor voz, cancelando a fala anterior', async () => {
    const synth = stubSynth([v('Luciana'), v('Microsoft Antonio Online (Natural)', 'pt-BR', false)]);
    expect(await speak('Bora!', { rate: 1.1, pitch: 1.2 })).toBe(true);
    const u = synth.speak.mock.calls[0][0];
    expect(u.text).toBe('Bora!');
    expect(u.voice.name).toBe('Microsoft Antonio Online (Natural)');
    expect(u.rate).toBe(1.1);
    expect(u.pitch).toBe(1.2);
    expect(synth.cancel).toHaveBeenCalled();
  });

  it('queue=true entra na fila sem cancelar', async () => {
    const synth = stubSynth([v('Luciana')]);
    await speak('Oi', { queue: true });
    expect(synth.cancel).not.toHaveBeenCalled();
    expect(synth.speak).toHaveBeenCalled();
  });

  it('sem voz em português não fala', async () => {
    stubSynth([v('Samantha', 'en-US')]);
    expect(await speak('Oi')).toBe(false);
  });

  it('speak usa a voz escolhida pelo nome', async () => {
    const synth = stubSynth([v('Luciana'), v('Felipe')]);
    await speak('Oi', { voiceName: 'Luciana' });
    expect(synth.speak.mock.calls[0][0].voice.name).toBe('Luciana');
  });

  it('listPtVoices lista só as de português, pt-BR e naturais primeiro, com o gênero', async () => {
    stubSynth([v('Joana', 'pt-PT'), v('Samantha', 'en-US'), v('Daniel'), v('Microsoft Francisca Online (Natural)', 'pt-BR', false)]);
    expect(await listPtVoices()).toEqual([
      { name: 'Microsoft Francisca Online (Natural)', lang: 'pt-BR', gender: 'female' },
      { name: 'Daniel', lang: 'pt-BR', gender: 'male' },
      { name: 'Joana', lang: 'pt-PT', gender: null },
    ]);
    vi.stubGlobal('window', {});
    expect(await listPtVoices()).toEqual([]);
  });
});
