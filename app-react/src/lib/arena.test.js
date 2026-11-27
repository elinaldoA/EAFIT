// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));
vi.mock('./tracking', () => ({ trackFeature: vi.fn() }));

import { levelProgress, visibleMissions, progressLabel, dailyLabel } from './arena';

describe('arena', () => {
  it('calcula a barra do nível', () => {
    expect(levelProgress({ xp: 515, level_from: 450, level_to: 800 })).toEqual({ pct: 19, toNext: 285 });
    expect(levelProgress({ xp: 0, level_from: 0, level_to: 50 })).toEqual({ pct: 0, toNext: 50 });
    expect(levelProgress({ xp: 900, level_from: 450, level_to: 800 }).pct).toBe(100);
    expect(levelProgress(null)).toEqual({ pct: 0, toNext: 0 });
  });

  it('filtra as missões pelo módulo', () => {
    const arena = { missions: [{ id: 'a', module: 'any' }, { id: 'g', module: 'gym' }, { id: 'r', module: 'run' }] };
    expect(visibleMissions(arena, 'gym').map(m => m.id)).toEqual(['a', 'g']);
    expect(visibleMissions(arena, 'run').map(m => m.id)).toEqual(['a', 'r']);
    expect(visibleMissions(arena).map(m => m.id)).toEqual(['a', 'g', 'r']);
    expect(visibleMissions(null, 'gym')).toEqual([]);
  });

  it('escreve o progresso sem passar da meta', () => {
    expect(progressLabel([{ metric: 'workouts', have: 2, target: 3 }])).toBe('2/3 treinos');
    expect(progressLabel([{ metric: 'workouts', have: 4, target: 3 }])).toBe('3/3 treinos');
    expect(progressLabel([{ metric: 'workouts', have: 1, target: 1 }, { metric: 'runs', have: 0, target: 1 }]))
      .toBe('1/1 treinos · 0/1 corridas');
    expect(progressLabel([{ metric: 'run_km', have: 2.5, target: 5 }])).toBe('2,5/5 km');
    expect(progressLabel([{ metric: 'desconhecida', have: 1, target: 1 }])).toBe('');
  });

  it('mostra o saldo do dia', () => {
    expect(dailyLabel({ today_xp: 150, daily_cap: 300 })).toBe('Hoje: 150/300 XP');
  });
});
