import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import { buildBreakdown, fillBuckets, topBuckets } from './planAnalytics';

const row = (dimension, value, users, extra = {}) => ({
  dimension, value, users, with_plan: users, trained_30d: users, never_trained: 0,
  sessions_per_week: 3, adherence_pct: 80, pain_users: 0, ...extra,
});

describe('buildBreakdown', () => {
  it('separa por dimensão, ordena por usuários e calcula percentuais', () => {
    const out = buildBreakdown([
      row('meta', 'massa', 4, { trained_30d: 2, pain_users: 1 }),
      row('meta', 'forca', 10),
      row('nivel', 'iniciante', 5),
    ]);
    expect(out.meta.map(r => r.value)).toEqual(['forca', 'massa']);
    const massa = out.meta.find(r => r.value === 'massa');
    expect(massa).toMatchObject({ trainedPct: 50, painPct: 25 });
    expect(out.nivel).toHaveLength(1);
  });

  it('marca o grupo com pior aderência, ignorando amostras pequenas', () => {
    const out = buildBreakdown([
      row('meta', 'massa', 10, { adherence_pct: 70 }),
      row('meta', 'forca', 8, { adherence_pct: 40 }),
      row('meta', 'saude', 2, { adherence_pct: 5 }),
    ]);
    expect(out.meta.filter(r => r.isWorst).map(r => r.value)).toEqual(['forca']);
  });

  it('não marca ninguém quando só há um grupo elegível', () => {
    const out = buildBreakdown([row('meta', 'massa', 10)]);
    expect(out.meta[0].isWorst).toBe(false);
  });

  it('aceita aderência e sessões nulas (sem plano)', () => {
    const out = buildBreakdown([row('meta', 'massa', 3, { adherence_pct: null, sessions_per_week: null })]);
    expect(out.meta[0]).toMatchObject({ adherencePct: null, sessionsPerWeek: null });
  });
});

describe('fillBuckets', () => {
  it('completa os baldes ausentes com zero', () => {
    const out = fillBuckets([{ kind: 'weekday', bucket: 1, sessions: '5' }, { kind: 'hour', bucket: 1, sessions: 99 }], 'weekday', 7);
    expect(out).toHaveLength(7);
    expect(out[1]).toEqual({ bucket: 1, sessions: 5 });
    expect(out[0]).toEqual({ bucket: 0, sessions: 0 });
  });
});

describe('topBuckets', () => {
  it('devolve os maiores, ignora zero e desempata pelo balde menor', () => {
    const buckets = [{ bucket: 0, sessions: 0 }, { bucket: 1, sessions: 5 }, { bucket: 2, sessions: 9 }, { bucket: 3, sessions: 5 }];
    expect(topBuckets(buckets, 2).map(b => b.bucket)).toEqual([2, 1]);
    expect(topBuckets(buckets, 5)).toHaveLength(3);
  });
});
