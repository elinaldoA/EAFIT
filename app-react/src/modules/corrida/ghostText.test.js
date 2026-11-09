import { describe, it, expect } from 'vitest';
import { gapText, gapSpoken, ghostName, ghostResultText } from './ghostText';
import { ghostFrom } from './ghost';
import { startRun } from './liveRun';

const g = ghostFrom({ client_id: 'a', title: 'Parque', run_date: '2026-10-01', duration_s: 1500, distance_m: 5000, splits: [300, 300, 300, 300, 300] });

describe('textos do fantasma', () => {
  it('à frente, atrás e no mesmo ponto', () => {
    expect(gapText(12)).toBe('12 s à frente');
    expect(gapText(-65)).toBe('1:05 atrás');
    expect(gapText(1)).toBe('no mesmo ponto');
    expect(gapText(-1)).toBe('no mesmo ponto');
  });

  it('frase falada', () => {
    expect(gapSpoken(12)).toBe('12 segundos à frente do fantasma.');
    expect(gapSpoken(-75)).toBe('1 minutos e 15 segundos atrás do fantasma.');
    expect(gapSpoken(0)).toBe('Junto do fantasma.');
  });

  it('nome: título e data; sem nada, corrida anterior', () => {
    expect(ghostName(g)).toContain('Parque');
    expect(ghostName({ title: null, date: null })).toBe('corrida anterior');
  });

  it('resultado no fim: mais rápido, mais lento ou empate; sem distância não compara', () => {
    expect(ghostResultText(g, 1450, 5000)).toContain('50 s mais rápido');
    expect(ghostResultText(g, 1560, 5000)).toContain('1:00 mais lento');
    expect(ghostResultText(g, 1500, 5000)).toContain('Empate');
    expect(ghostResultText(g, 20, 50)).toBeNull();
  });
});

describe('corrida com fantasma', () => {
  it('o fantasma fica guardado na corrida; sem fantasma, nada é guardado', () => {
    expect(startRun({ gps: true, ghost: g }, 1000).ghost).toEqual(g);
    expect(startRun({ gps: true }, 1000)).not.toHaveProperty('ghost');
  });
});
