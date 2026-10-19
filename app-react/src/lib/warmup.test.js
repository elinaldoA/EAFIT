// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { warmupCount, warmupSets, isWarmupDone, setWarmupDone, warmupKey } from './warmup';

beforeEach(() => localStorage.clear());

describe('warmupCount', () => {
  const ex = (aquecimento, series = '4') => ({ nome: 'Supino', series, aquecimento });

  it('automático: 2 no primeiro exercício do dia, 0 nos outros', () => {
    expect(warmupCount(ex(null), 0)).toBe(2);
    expect(warmupCount(ex(undefined), 1)).toBe(0);
    expect(warmupCount(ex(null), -1)).toBe(0);
  });

  it('respeita o valor do plano (0 desliga) e limita a 3', () => {
    expect(warmupCount(ex(0), 0)).toBe(0);
    expect(warmupCount(ex(3), 4)).toBe(3);
    expect(warmupCount(ex(9), 0)).toBe(3);
  });

  it('cardio e itens sem séries não aquecem', () => {
    expect(warmupCount({ nome: '🏃 Cardio — Esteira', series: '-', aquecimento: 2 }, 0)).toBe(0);
    expect(warmupCount({ nome: 'Prancha', series: '', aquecimento: null }, 0)).toBe(0);
  });
});

describe('warmupSets', () => {
  it('calcula a carga em % da de trabalho, arredondando para baixo em 2,5 kg', () => {
    expect(warmupSets(2, '60')).toEqual([
      { n: 1, pct: 50, reps: 10, carga: 30 },
      { n: 2, pct: 70, reps: 5, carga: 40 },
    ]);
    expect(warmupSets(3, '42,5').map(s => s.carga)).toEqual([15, 25, 32.5]);
  });

  it('sem carga de trabalho, ou leve demais, sai sem carga', () => {
    expect(warmupSets(1, null)).toEqual([{ n: 1, pct: 60, reps: 8, carga: null }]);
    expect(warmupSets(2, 4)[0].carga).toBeNull();
    expect(warmupSets(0, 50)).toEqual([]);
  });
});

describe('check do aquecimento', () => {
  it('fica no aparelho, por data, e desmarca', () => {
    setWarmupDone('Segunda', 'Supino', 1, true);
    expect(isWarmupDone('Segunda', 'Supino', 1)).toBe(true);
    expect(localStorage.getItem(warmupKey('Segunda', 'Supino', 1))).toBe('true');
    setWarmupDone('Segunda', 'Supino', 1, false);
    expect(isWarmupDone('Segunda', 'Supino', 1)).toBe(false);
  });

  it('apaga checks de outras semanas ao gravar', () => {
    localStorage.setItem('warm_2020-01-06_Supino_1', 'true');
    setWarmupDone('Terça', 'Agachamento', 1, true);
    expect(localStorage.getItem('warm_2020-01-06_Supino_1')).toBeNull();
  });
});
