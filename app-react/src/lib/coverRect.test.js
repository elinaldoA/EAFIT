import { describe, it, expect, vi } from 'vitest';

vi.mock('./qr', () => ({ drawQr: () => {} }));
import { coverRect } from './shareCard';

describe('coverRect', () => {
  it('foto larga (paisagem) é cortada nas laterais, centralizada e sem esticar', () => {
    const r = coverRect(2000, 1000, 1080, 1920);
    expect(r.h).toBeCloseTo(1920);
    expect(r.w).toBeCloseTo(3840);
    expect(r.x).toBeCloseTo((1080 - 3840) / 2);
    expect(r.y).toBeCloseTo(0);
  });

  it('foto alta demais é cortada em cima e embaixo', () => {
    const r = coverRect(1000, 4000, 1080, 1920);
    expect(r.w).toBeCloseTo(1080);
    expect(r.h).toBeCloseTo(4320);
    expect(r.y).toBeCloseTo((1920 - 4320) / 2);
    expect(r.x).toBeCloseTo(0);
  });

  it('foto 9:16 preenche exatamente', () => {
    expect(coverRect(540, 960, 1080, 1920)).toEqual({ x: 0, y: 0, w: 1080, h: 1920 });
  });
});
