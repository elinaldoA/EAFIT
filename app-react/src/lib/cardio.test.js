import { describe, it, expect } from 'vitest';
import { isCardioItem, parsePlannedMinutes, formatPace, formatCardioSummary, toPositive } from './cardio';

describe('isCardioItem', () => {
  it('reconhece itens sem séries com nome de cardio', () => {
    expect(isCardioItem({ nome: '🏃 Cardio — Esteira', series: '-' })).toBe(true);
    expect(isCardioItem({ nome: 'Corrida Contínua (Longão)', series: '-' })).toBe(true);
  });
  it('ignora exercícios com séries e itens sem séries que não são cardio', () => {
    expect(isCardioItem({ nome: 'Corrida Intervalada', series: '3' })).toBe(false);
    expect(isCardioItem({ nome: 'Alongamento', series: '-' })).toBe(false);
  });
});

describe('parsePlannedMinutes', () => {
  it('extrai os minutos do texto do plano', () => {
    expect(parsePlannedMinutes('20min · Moderado')).toBe(20);
    expect(parsePlannedMinutes('8x400m forte')).toBeNull();
  });
});

describe('formatPace', () => {
  it('calcula min/km', () => {
    expect(formatPace(30, 5)).toBe('6:00');
    expect(formatPace('27,5', '5')).toBe('5:30');
  });
  it('retorna null sem dados válidos', () => {
    expect(formatPace('', '5')).toBeNull();
    expect(formatPace(30, 0)).toBeNull();
  });
});

describe('formatCardioSummary', () => {
  it('junta duração, distância e ritmo', () => {
    expect(formatCardioSummary(30, 5)).toBe('30 min · 5 km · 6:00/km');
    expect(formatCardioSummary(20, '')).toBe('20 min');
  });
});

describe('toPositive', () => {
  it('aceita vírgula e rejeita negativos', () => {
    expect(toPositive('2,5')).toBe(2.5);
    expect(toPositive('-1')).toBeNull();
    expect(toPositive('abc')).toBeNull();
  });
});
