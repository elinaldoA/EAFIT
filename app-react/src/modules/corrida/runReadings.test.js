import { describe, it, expect } from 'vitest';
import { longestStreakWeeks, achievements, weeklyLoad, weekEffort, racePredictions, paceTrend } from './runReadings';

// Sexta, 6/11/2026 (segunda da semana: 2/11).
const TODAY = '2026-11-06';
const run = (run_date, distance_m = 5000, duration_s = 1500, extra = {}) => ({ run_date, distance_m, duration_s, splits: [], ...extra });

describe('conquistas', () => {
  it('maior sequência de semanas, mesmo antiga', () => {
    expect(longestStreakWeeks([])).toBe(0);
    const runs = [run('2026-01-05'), run('2026-01-12'), run('2026-01-19'), run('2026-01-26'), run('2026-03-02')];
    expect(longestStreakWeeks(runs)).toBe(4);
  });

  it('desbloqueia pela distância, contagem e total; o resto mostra o progresso', () => {
    const list = achievements([run('2026-11-02', 10500), run('2026-11-03', 5000)]);
    const by = id => list.find(a => a.id === id);
    expect(by('count-1').unlocked).toBe(true);
    expect(by('count-10').unlocked).toBe(false);
    expect(by('count-10').progress).toBeCloseTo(0.2);
    expect(by('dist-5').unlocked).toBe(true);
    expect(by('dist-10').unlocked).toBe(true);
    expect(by('dist-21').unlocked).toBe(false);
    expect(by('dist-21').progress).toBeCloseTo(10500 / 21097);
    expect(by('total-50').unlocked).toBe(false);
  });

  it('sem corridas nada está desbloqueado', () => {
    expect(achievements([]).every(a => !a.unlocked && a.progress === 0)).toBe(true);
  });
});

describe('carga da semana', () => {
  it('sem corrida na semana passada não há o que comparar', () => {
    expect(weeklyLoad([run('2026-11-03')], TODAY).level).toBeNull();
  });

  it('dentro de 10% mostra quanto ainda cabe', () => {
    const w = weeklyLoad([run('2026-10-27', 20000), run('2026-11-03', 10000)], TODAY);
    expect(w.level).toBe('ok');
    expect(w.roomM).toBeCloseTo(12000);
  });

  it('passou de 10% sobre a semana anterior', () => {
    const w = weeklyLoad([run('2026-10-27', 10000), run('2026-11-03', 8000), run('2026-11-05', 4000)], TODAY);
    expect(w.level).toBe('alto');
    expect(w.roomM).toBe(0);
  });

  it('média das 4 semanas passadas e esforço médio da semana', () => {
    const runs = [run('2026-10-27', 8000), run('2026-10-20', 8000), run('2026-10-13', 8000), run('2026-10-06', 8000), run('2026-11-03', 5000, 1500, { effort: 6 }), run('2026-11-04', 5000, 1500, { effort: 7 }), run('2026-11-05')];
    expect(weeklyLoad(runs, TODAY).avg4).toBe(8000);
    expect(weekEffort(runs, TODAY)).toBe(6.5);
    expect(weekEffort([run('2026-11-03')], TODAY)).toBeNull();
  });
});

describe('previsão de prova', () => {
  it('Riegel: 5K em 25:00 prevê 10K perto de 52:08', () => {
    const p = racePredictions([run('2026-11-01', 5000, 1500)], TODAY);
    expect(p.find(r => r.key === '5k').seconds).toBe(1500);
    expect(p.find(r => r.key === '10k').seconds).toBe(Math.round(1500 * 2 ** 1.06));
  });

  it('não extrapola de um treino curto demais', () => {
    const p = racePredictions([run('2026-11-01', 5000, 1500)], TODAY);
    expect(p.find(r => r.key === '21k').seconds).toBeNull();
    expect(p.find(r => r.key === '42k').seconds).toBeNull();
  });

  it('ignora corridas com mais de 90 dias e as curtas (< 3 km)', () => {
    expect(racePredictions([run('2026-05-01', 10000, 3000)], TODAY).every(r => r.seconds === null)).toBe(true);
    expect(racePredictions([run('2026-11-01', 2000, 600)], TODAY).every(r => r.seconds === null)).toBe(true);
  });

  it('usa o melhor trecho dos parciais quando é mais rápido que a corrida inteira', () => {
    const splits = [330, 330, 330, 330, 330, 400, 400, 400, 400, 400]; // 10 km, 5 primeiros rápidos
    const p = racePredictions([run('2026-11-01', 10000, 3660, { splits })], TODAY);
    expect(p.find(r => r.key === '5k').seconds).toBe(1650);
  });
});

describe('tendência de ritmo', () => {
  it('compara as 4 últimas semanas com as 4 anteriores', () => {
    const runs = [
      run('2026-11-03', 5000, 1500), run('2026-10-27', 5000, 1500), // 300 s/km
      run('2026-10-06', 5000, 1650), run('2026-10-01', 5000, 1650), // 330 s/km
    ];
    const tr = paceTrend(runs, TODAY);
    expect(tr).toEqual({ recent: 300, before: 330, delta: -30 });
  });

  it('sem corridas suficientes nos dois períodos não opina', () => {
    expect(paceTrend([run('2026-11-03'), run('2026-10-27')], TODAY)).toBeNull();
  });
});

describe('conquistas novas', () => {
  it('só devolve o que a corrida nova desbloqueou', async () => {
    const { newAchievements } = await import('./runReadings');
    const first = newAchievements([], [run('2026-11-02', 5200)]).map(a => a.id);
    expect(first).toEqual(['count-1', 'dist-5']);
    const before = [run('2026-11-02', 5200)];
    expect(newAchievements(before, [...before, run('2026-11-04', 10100)]).map(a => a.id)).toEqual(['dist-10']);
    expect(newAchievements(before, [...before, run('2026-11-04', 3000)])).toEqual([]);
  });
});
