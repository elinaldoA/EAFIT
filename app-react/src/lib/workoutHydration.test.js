import { describe, it, expect } from 'vitest';
import {
  nextHydrationAt, shouldRemindHydration, isWorkoutHydrationOn, HYDRATION_EVERY_MS, HYDRATION_MAX_WAIT_MS,
} from './workoutHydration';

const MIN = 60 * 1000;

describe('nextHydrationAt', () => {
  it('o primeiro aviso é aos 15 min', () => {
    expect(nextHydrationAt(0)).toBe(HYDRATION_EVERY_MS);
    expect(nextHydrationAt(14 * MIN)).toBe(15 * MIN);
  });
  it('ao reabrir no meio do treino, espera o próximo marco', () => {
    expect(nextHydrationAt(20 * MIN)).toBe(30 * MIN);
    expect(nextHydrationAt(30 * MIN)).toBe(45 * MIN);
  });
});

describe('shouldRemindHydration', () => {
  it('não avisa antes do marco', () => {
    expect(shouldRemindHydration({ elapsedMs: 14 * MIN, nextAt: 15 * MIN, resting: true })).toBe(false);
  });
  it('no marco, espera o descanso', () => {
    expect(shouldRemindHydration({ elapsedMs: 16 * MIN, nextAt: 15 * MIN, resting: false })).toBe(false);
    expect(shouldRemindHydration({ elapsedMs: 16 * MIN, nextAt: 15 * MIN, resting: true })).toBe(true);
  });
  it('sem descanso por 3 min, avisa mesmo assim', () => {
    expect(shouldRemindHydration({ elapsedMs: 15 * MIN + HYDRATION_MAX_WAIT_MS, nextAt: 15 * MIN, resting: false })).toBe(true);
  });
});

describe('isWorkoutHydrationOn', () => {
  it('vem ligado e respeita quem desligou', () => {
    expect(isWorkoutHydrationOn(null)).toBe(true);
    expect(isWorkoutHydrationOn({ user_metadata: {} })).toBe(true);
    expect(isWorkoutHydrationOn({ user_metadata: { notifyWorkoutWater: false } })).toBe(false);
  });
});
