import { describe, it, expect, beforeEach } from 'vitest';
import { plateKind, defaultBar, platesPerSide, readBar, saveBar, readPlates, savePlates, ALL_PLATES } from './plates';

describe('plateKind', () => {
  it('reconhece barra, leg press e o que não leva anilha', () => {
    expect(plateKind('Supino Reto com Barra')).toBe('barra');
    expect(plateKind('Agachamento Livre')).toBe('barra');
    expect(plateKind('Leg Press 45°')).toBe('sled');
    expect(plateKind('Remada com Barra T')).toBe('sled');
    expect(plateKind('Barra Fixa Pronada')).toBeNull();
    expect(plateKind('Crucifixo Máquina')).toBeNull();
  });

  it('barra W começa com 10 kg e leg press sem barra', () => {
    expect(defaultBar('Rosca Direta Barra W')).toBe(10);
    expect(defaultBar('Supino Reto com Barra')).toBe(20);
    expect(defaultBar('Leg Press 45°')).toBe(0);
  });
});

describe('platesPerSide', () => {
  it('divide a carga pelos dois lados com o menor número de anilhas', () => {
    expect(platesPerSide(85, 20)).toEqual({ perSide: [25, 5, 2.5], loaded: 85, remainder: 0, belowBar: false });
    expect(platesPerSide('100', 20).perSide).toEqual([25, 15]);
    expect(platesPerSide('62,5', 20).perSide).toEqual([20, 1.25]);
  });

  it('acha a combinação exata quando a gulosa falharia', () => {
    expect(platesPerSide(60, 20, [15, 10]).perSide).toEqual([10, 10]);
  });

  it('fica no mais perto abaixo e diz quanto faltou', () => {
    const r = platesPerSide(61, 20);
    expect(r.loaded).toBe(60);
    expect(r.remainder).toBe(1);
  });

  it('só a barra, carga abaixo da barra e carga inválida', () => {
    expect(platesPerSide(20, 20).perSide).toEqual([]);
    expect(platesPerSide(15, 20).belowBar).toBe(true);
    expect(platesPerSide('', 20)).toBeNull();
  });
});

describe('preferências no aparelho', () => {
  beforeEach(() => localStorage.clear());

  it('lembra a barra por exercício', () => {
    expect(readBar('Supino Reto com Barra')).toBe(20);
    saveBar('Supino Reto com Barra', 15);
    expect(readBar('Supino Reto com Barra')).toBe(15);
    saveBar('Supino Reto com Barra', 0);
    expect(readBar('Supino Reto com Barra')).toBe(0);
  });

  it('lembra as anilhas e volta ao padrão se vier vazio', () => {
    expect(readPlates()).toEqual(ALL_PLATES);
    savePlates([20, 10]);
    expect(readPlates()).toEqual([20, 10]);
    savePlates([]);
    expect(readPlates()).toEqual(ALL_PLATES);
  });
});
