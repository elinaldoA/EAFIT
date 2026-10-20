// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { captureAttribution, detectAttribution, pendingAttribution, clearAttribution } from './attribution';

const DAY = 86400000;

describe('attribution', () => {
  beforeEach(() => localStorage.clear());

  it('só conta chegada de fora: utm/origem ou outro site; direto e o próprio site não', () => {
    expect(detectAttribution('?utm_source=Instagram&utm_campaign=Outubro Rosa&utm_medium=story', '', 'eafit.com.br'))
      .toEqual({ source: 'instagram', campaign: 'outubrorosa', medium: 'story', content: '' });
    expect(detectAttribution('', 'https://www.google.com/', 'eafit.com.br')).toMatchObject({ source: 'google', campaign: '' });
    expect(detectAttribution('', '', 'eafit.com.br')).toBeNull();
    expect(detectAttribution('', 'https://eafit.com.br/', 'eafit.com.br')).toBeNull();
  });

  it('primeiro toque vale por 30 dias e não é trocado por outra chegada', () => {
    const now = Date.now();
    captureAttribution('?utm_source=tiktok&utm_campaign=lancamento', '', now);
    captureAttribution('?utm_source=google', '', now + DAY);
    expect(pendingAttribution(now + DAY)).toEqual({ source: 'tiktok', campaign: 'lancamento', medium: '', content: '' });
    expect(pendingAttribution(now + 31 * DAY)).toBeNull();
    clearAttribution();
    expect(pendingAttribution(now)).toBeNull();
  });
});
