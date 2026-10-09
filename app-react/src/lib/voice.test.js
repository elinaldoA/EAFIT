import { describe, it, expect, vi, afterEach } from 'vitest';
import { pickVoice, voiceGender, isVoiceSupported, speak, cancelSpeech, listPtVoices, splitSentences, prosody } from './voice';

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

describe('entonação', () => {
  it('splitSentences corta nas frases, sem partir números nem perder o resto', () => {
    expect(splitSentences('Recorde! 42,5 quilos em Supino! Que máquina!')).toEqual(['Recorde!', '42,5 quilos em Supino!', 'Que máquina!']);
    expect(splitSentences('Agora é Remada 2.5. Bora')).toEqual(['Agora é Remada 2.5.', 'Bora']);
    expect(splitSentences('Mentira, dói bastante.')).toEqual(['Mentira, dói bastante.']);
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences(undefined)).toEqual([]);
  });

  it('prosody: exclamação sobe e acelera, pergunta sobe, afirmação assenta, interjeição não corre', () => {
    const mid = () => 0.5;
    const exclama = prosody('Vamos fazer valer isso!', mid);
    const pergunta = prosody('Bora tentar mais uma?', mid);
    const afirma = prosody('Descansa 1 minuto.', mid);
    expect(exclama.rate).toBeGreaterThan(1);
    expect(exclama.pitch).toBeGreaterThan(1);
    expect(pergunta.pitch).toBeGreaterThan(exclama.pitch);
    expect(afirma.rate).toBeLessThan(1);
    expect(afirma.pitch).toBeLessThan(1);
    expect(prosody('Boa!', mid).rate).toBeLessThan(exclama.rate);
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

  it('voz antiga de som sintético só é escolhida se não houver outra', () => {
    expect(pickVoice([v('Microsoft Maria Desktop'), v('Google português do Brasil', 'pt-BR', false)]).name).toBe('Google português do Brasil');
    expect(pickVoice([v('eSpeak Portuguese (Brazil)'), v('Luciana')]).name).toBe('Luciana');
    expect(pickVoice([v('Luciana (Compact)'), v('Luciana (Enhanced)')]).name).toBe('Luciana (Enhanced)');
    expect(pickVoice([v('Microsoft Maria Desktop')]).name).toBe('Microsoft Maria Desktop');
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
    expect(await speak('Bora!', { rate: 1.1, pitch: 1.2, random: () => 0.5 })).toBe(true);
    const u = synth.speak.mock.calls[0][0];
    expect(u.text).toBe('Bora!');
    expect(u.voice.name).toBe('Microsoft Antonio Online (Natural)');
    // base × entonação da frase: exclamação curta
    expect(u.rate).toBeCloseTo(1.1 * 1.03 * 0.95);
    expect(u.pitch).toBeCloseTo(1.2 * 1.04);
    expect(synth.cancel).toHaveBeenCalled();
  });

  it('cada frase vira uma fala, com entonação própria e um único cancelamento', async () => {
    const synth = stubSynth([v('Luciana')]);
    await speak('Boa! Descansa 1 minuto e 30 segundos. Vamos nessa de novo?', { random: () => 0.5 });
    const said = synth.speak.mock.calls.map(c => c[0]);
    expect(said.map(u => u.text)).toEqual(['Boa!', 'Descansa 1 minuto e 30 segundos.', 'Vamos nessa de novo?']);
    expect(synth.cancel).toHaveBeenCalledTimes(1);
    const [exclama, afirma, pergunta] = said;
    expect(exclama.pitch).toBeGreaterThan(afirma.pitch);
    expect(pergunta.pitch).toBeGreaterThan(afirma.pitch);
    expect(afirma.rate).toBeLessThan(1);
  });

  it('a mesma frase nunca sai idêntica, mas a variação é pequena', async () => {
    const synth = stubSynth([v('Luciana')]);
    await speak('Bora treinar agora!', { random: () => 0 });
    await speak('Bora treinar agora!', { random: () => 0.999 });
    const [a, b] = synth.speak.mock.calls.map(c => c[0]);
    expect(a.rate).not.toBe(b.rate);
    expect(Math.abs(a.rate - b.rate)).toBeLessThan(0.06);
    expect(Math.abs(a.pitch - b.pitch)).toBeLessThan(0.07);
  });

  it('texto vazio ou só de espaços não fala', async () => {
    const synth = stubSynth([v('Luciana')]);
    expect(await speak('   ')).toBe(false);
    expect(synth.speak).not.toHaveBeenCalled();
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
      { name: 'Microsoft Francisca Online (Natural)', lang: 'pt-BR', gender: 'female', natural: true },
      { name: 'Daniel', lang: 'pt-BR', gender: 'male', natural: false },
      { name: 'Joana', lang: 'pt-PT', gender: null, natural: false },
    ]);
    vi.stubGlobal('window', {});
    expect(await listPtVoices()).toEqual([]);
  });
});
