import { describe, it, expect } from 'vitest';
import { weightFromMeta, runCalories, strengthCalories } from './calories';

describe('calories', () => {
  it('lê o peso do perfil, aceitando vírgula', () => {
    expect(weightFromMeta({ peso: '72,5' })).toBe(72.5);
    expect(weightFromMeta({ peso: 80 })).toBe(80);
    expect(weightFromMeta({ peso: '' })).toBeNull();
    expect(weightFromMeta({ peso: '5' })).toBeNull();
    expect(weightFromMeta(undefined)).toBeNull();
  });

  it('corrida: 10 km em 1h (10 km/h, MET 10,5) com 70 kg', () => {
    expect(runCalories({ distance_m: 10000, duration_s: 3600 }, 70)).toBe(735);
  });

  it('corrida: null sem peso ou sem dados', () => {
    expect(runCalories({ distance_m: 5000, duration_s: 1800 }, null)).toBeNull();
    expect(runCalories({ distance_m: 0, duration_s: 1800 }, 70)).toBeNull();
  });

  it('musculação: 1h com 30 séries (MET 6) e 70 kg', () => {
    expect(strengthCalories({ durationSeconds: 3600, doneSets: 30 }, 70)).toBe(420);
    expect(strengthCalories({ durationSeconds: 3600, doneSets: 20 }, 70)).toBe(350);
    expect(strengthCalories({ durationSeconds: 3600, doneSets: 10 }, 70)).toBe(245);
  });

  it('musculação: sem séries usa MET 5; sem duração ou peso é null', () => {
    expect(strengthCalories({ durationSeconds: 3600, doneSets: 0 }, 70)).toBe(350);
    expect(strengthCalories({ durationSeconds: 0, doneSets: 5 }, 70)).toBeNull();
    expect(strengthCalories({ durationSeconds: 3600, doneSets: 5 }, null)).toBeNull();
  });
});
