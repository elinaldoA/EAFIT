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

import { setExtras } from './intensity';
import { formatSets } from './trainerInsights';

describe('setExtras', () => {
  it('lista RIR e tipo só quando existem', () => {
    expect(setExtras(null, null)).toEqual([]);
    expect(setExtras(undefined, undefined)).toEqual([]);
    expect(setExtras(0, null)).toEqual(['RIR 0']);
    expect(setExtras(2, 'drop_set')).toEqual(['RIR 2', 'Drop-set']);
    expect(setExtras(null, 'xyz')).toEqual([]);
  });
  it('aparece no resumo das séries do personal', () => {
    expect(formatSets([{ carga: 80, reps: 8, rir: 2, tipo: null }, { carga: 80, reps: 6, rir: null, tipo: 'falha' }]))
      .toBe('80×8 (RIR 2) · 80×6 (Até a falha)');
  });
});
