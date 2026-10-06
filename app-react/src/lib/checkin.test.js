import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import { buildCheckinInsights, checkinTip } from './checkin';

const mk = (d, energy, sleep = 3, mood = 3) => ({ checkin_date: d, energy, sleep, mood });

describe('buildCheckinInsights', () => {
  it('sem check-ins devolve null', () => {
    expect(buildCheckinInsights([], [])).toBeNull();
  });

  it('calcula médias', () => {
    const r = buildCheckinInsights([mk('2026-10-01', 4, 2, 5), mk('2026-10-02', 2, 4, 3)], []);
    expect(r).toMatchObject({ days: 2, energy: 3, sleep: 3, mood: 4, compare: null });
  });

  it('só compara treino x descanso com 3+ dias de cada lado', () => {
    const rows = [
      mk('2026-10-01', 5, 3, 5), mk('2026-10-02', 5, 3, 5), mk('2026-10-03', 4, 3, 4),
      mk('2026-10-04', 2, 3, 2), mk('2026-10-05', 2, 3, 3), mk('2026-10-06', 3, 3, 2),
    ];
    const trained = ['2026-10-01', '2026-10-02', '2026-10-03'];
    expect(buildCheckinInsights(rows, trained).compare).toEqual({ energyOn: 4.7, energyOff: 2.3, moodOn: 4.7, moodOff: 2.3 });
    expect(buildCheckinInsights(rows, trained.slice(0, 2)).compare).toBeNull();
  });
});

describe('checkinTip', () => {
  it('muda conforme energia e sono', () => {
    expect(checkinTip({ energy: 1, sleep: 1 })).toMatch(/puxado/);
    expect(checkinTip({ energy: 2, sleep: 4 })).toMatch(/Energia baixa/);
    expect(checkinTip({ energy: 4, sleep: 2 })).toMatch(/Dormiu mal/);
    expect(checkinTip({ energy: 5, sleep: 4 })).toMatch(/recorde/);
    expect(checkinTip({ energy: 3, sleep: 3 })).toMatch(/Tudo certo/);
  });
});
