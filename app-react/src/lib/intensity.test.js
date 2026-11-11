import { describe, it, expect } from 'vitest';
import { INTENSITY_KEYS, normalizeIntensity, intensityLabel, intensityHint } from './intensity';

describe('intensity', () => {
  it('aceita só as técnicas conhecidas', () => {
    INTENSITY_KEYS.forEach(k => expect(normalizeIntensity(k)).toBe(k));
    expect(normalizeIntensity('')).toBeNull();
    expect(normalizeIntensity(null)).toBeNull();
    expect(normalizeIntensity('pirâmide')).toBeNull();
  });
  it('tem rótulo e dica para cada técnica', () => {
    INTENSITY_KEYS.forEach(k => {
      expect(intensityLabel(k)).toBeTruthy();
      expect(intensityHint(k)).toBeTruthy();
    });
    expect(intensityHint(null)).toBe('');
  });
});
