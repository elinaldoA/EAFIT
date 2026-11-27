// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));
vi.mock('./tracking', () => ({ trackFeature: vi.fn() }));

import {
  levelProgress, visibleMissions, progressLabel, dailyLabel, parseArenaBadge, seasonName, shortDate, seasonDaysLeft,
  bossPercent, bossAmount, bossMine, bossHitSince, bossHp,
} from './arena';
import { arenaBadges, visibleBadges } from './achievements';

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

  it('lê a medalha da temporada e monta a grade', () => {
    expect(parseArenaBadge('arena_temporada-1_1')).toEqual({ slug: 'temporada-1', position: 1 });
    expect(parseArenaBadge('arena_temporada-1_4')).toBeNull();
    expect(parseArenaBadge('liga_ouro_1_2026-10')).toBeNull();
    expect(seasonName('temporada-1')).toBe('Temporada 1');
    const ids = new Set(['streak_3', 'arena_temporada-2_3', 'arena_temporada-1_1']);
    const list = arenaBadges(ids);
    expect(list.map(b => b.id)).toEqual(['arena_temporada-1_1', 'arena_temporada-2_3']);
    expect(list[0]).toMatchObject({ emoji: '🥇', title: 'Arena · Temporada 1 · 1º' });
    expect(list[0].check()).toBe(false);
    expect(visibleBadges(ids).filter(b => b.arena)).toHaveLength(2);
  });

  it('calcula e escreve o progresso do chefão', () => {
    expect(bossPercent({ goal: 750, value: 300 })).toBe(40);
    expect(bossPercent({ goal: 10, value: 25 })).toBe(100);
    expect(bossPercent({ goal: 0, value: 5 })).toBe(0);
    expect(bossPercent(null)).toBe(0);
    expect(bossAmount({ metric: 'xp', goal: 750, value: 300 })).toBe('300 de 750 XP');
    expect(bossAmount({ metric: 'workouts', goal: 10, value: 7 })).toBe('7 de 10 treinos');
    expect(bossAmount({ metric: 'run_km', goal: 40, value: 12.5 })).toBe('12,5 de 40 km');
    expect(bossMine({ metric: 'run_km', mine: 5 })).toBe('5 km');
    expect(bossMine({ metric: 'workouts', mine: 2 })).toBe('2 treinos');
    expect(bossMine({ metric: 'xp', mine: 0 })).toBe('0 XP');
  });

  it('calcula a vida do monstro e o que mudou desde a última visita', () => {
    expect(bossHp({ goal: 750, value: 300 })).toBe(60);
    expect(bossHp({ goal: 10, value: 25 })).toBe(0);
    expect(bossHp({ goal: 10, value: 3, defeated: true })).toBe(0);
    const boss = { id: 'b1', goal: 750, value: 300, defeated: false };
    expect(bossHitSince(null, boss)).toBeNull();
    expect(bossHitSince({ id: 'x', value: 0, defeated: false }, boss)).toBeNull();
    expect(bossHitSince({ id: 'b1', value: 300, defeated: false }, boss)).toBeNull();
    expect(bossHitSince({ id: 'b1', value: 400, defeated: false }, boss)).toBeNull();
    expect(bossHitSince({ id: 'b1', value: 150, defeated: false }, boss)).toEqual({ type: 'hit', dmg: 20 });
    expect(bossHitSince({ id: 'b1', value: 299.9, defeated: false }, boss)).toEqual({ type: 'hit', dmg: 1 });
    expect(bossHitSince({ id: 'b1', value: 700, defeated: false }, { ...boss, value: 760, defeated: true })).toEqual({ type: 'defeat', dmg: 8 });
    expect(bossHitSince({ id: 'b1', value: 760, defeated: true }, { ...boss, value: 760, defeated: true })).toBeNull();
    expect(bossHitSince({ id: 'b1', value: 1 }, { id: 'b1', goal: 0, value: 5 })).toBeNull();
  });

  it('formata datas e dias que faltam da temporada', () => {
    expect(shortDate('2026-12-01')).toBe('01/12');
    expect(shortDate('')).toBe('');
    expect(seasonDaysLeft('2026-12-10', '2026-12-01')).toBe(9);
    expect(seasonDaysLeft('2026-12-01', '2026-12-01')).toBe(0);
    expect(seasonDaysLeft('2026-12-01', '2026-12-05')).toBe(0);
    expect(seasonDaysLeft('xx', '2026-12-05')).toBe(0);
  });
});
