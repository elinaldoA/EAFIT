import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import { beforeAfter } from './trainerPhotos';

describe('beforeAfter', () => {
  it('usa a primeira e a última foto', () => {
    const photos = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(beforeAfter(photos)).toEqual({ before: { id: 1 }, after: { id: 3 } });
  });
  it('precisa de pelo menos duas fotos', () => {
    expect(beforeAfter([{ id: 1 }])).toBeNull();
    expect(beforeAfter([])).toBeNull();
    expect(beforeAfter(null)).toBeNull();
  });
});
