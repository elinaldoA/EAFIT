import { describe, it, expect } from 'vitest';
import { cropRun, canCrop, mergeRuns, canMerge, routeLengthM } from './runEdit';

// ~111 m por ponto andando para o norte (0,001° de latitude); t em segundos de corrida.
const line = (n, t0 = 0) => [Array.from({ length: n }, (_, i) => [-2355000 + i * 100, -4665000, t0 + i * 30])];
const run = (over = {}) => ({
  client_id: 'a', run_date: '2026-11-17', started_at: '2026-11-17T08:00:00Z', distance_m: 2000, duration_s: 600,
  route: line(21), splits: [300, 300], km_elev: [[1, 1], [1, 1]], elev_gain_m: 10, gps: true, kind: 'livre', ...over,
});

describe('cortar o percurso', () => {
  it('só com o tempo nos pontos e percurso de pelo menos 200 m', () => {
    expect(canCrop(run())).toBe(true);
    expect(canCrop(run({ route: [[[1, 1], [2, 2]]] }))).toBe(false);
    expect(canCrop(run({ route: [] }))).toBe(false);
    expect(cropRun(run({ route: [[[-2355000, -4665000], [-2354900, -4665000]]] }), 0, 0).error).toBe('sem-tempo');
  });
  it('o que sai do mapa sai da distância e do tempo; parciais e subida por km somem', () => {
    const len = routeLengthM(run().route);
    expect(len).toBeGreaterThan(2000);
    const out = cropRun(run(), 500, 0);
    expect(out.removedM).toBe(500);
    expect(out.patch.distance_m).toBe(1500);
    expect(out.patch.duration_s).toBeLessThan(600);
    expect(out.patch.duration_s).toBeGreaterThan(400);
    expect(out.patch).toMatchObject({ splits: [], km_elev: null, elev_gain_m: null });
    expect(out.patch.route[0][0][2]).toBeGreaterThan(0);
  });
  it('cortar o fim também tira distância e tempo', () => {
    const out = cropRun(run(), 0, 800);
    expect(out.patch.distance_m).toBe(1200);
    expect(out.patch.duration_s).toBeLessThan(450);
  });
  it('não deixa sobrar menos de 100 m', () => {
    expect(cropRun(run(), 1000, 1000).error).toBe('curto-demais');
  });
});

describe('juntar corridas', () => {
  const a = run({ client_id: 'a', started_at: '2026-11-17T08:00:00Z', distance_m: 3000, duration_s: 900, route: line(11), cadence: 160, hr: { avg: 140, max: 160, z: [0, 600, 300, 0, 0] }, effort: 4, title: 'Manhã' });
  const b = run({ client_id: 'b', started_at: '2026-11-17T09:00:00Z', distance_m: 2000, duration_s: 600, route: line(11), cadence: 170, hr: { avg: 150, max: 175, z: [0, 0, 600, 0, 0] }, effort: 6 });

  it('só no mesmo dia e corridas diferentes', () => {
    expect(canMerge(a, b)).toBe(true);
    expect(canMerge(a, a)).toBe(false);
    expect(canMerge(a, { ...b, run_date: '2026-11-18' })).toBe(false);
    expect(mergeRuns(a, { ...b, run_date: '2026-11-18' }).error).toBe('nao-junta');
  });
  it('soma distância e tempo, e a que começou antes é a que fica (qualquer ordem)', () => {
    for (const [x, y] of [[a, b], [b, a]]) {
      const m = mergeRuns(x, y);
      expect(m.keep.client_id).toBe('a');
      expect(m.drop.client_id).toBe('b');
      expect(m.patch).toMatchObject({ distance_m: 5000, duration_s: 1500, splits: [], km_elev: null, effort: 6, title: 'Manhã', gps: true });
    }
  });
  it('emenda os percursos: o tempo da segunda segue o da primeira e os trechos ficam separados', () => {
    const { patch } = mergeRuns(a, b);
    expect(patch.route).toHaveLength(2);
    expect(patch.route[1][0][2]).toBe(900);
    expect(patch.route[1].at(-1)[2]).toBe(900 + 300);
  });
  it('frequência e cadência pela média ponderada pelo tempo; zonas somadas', () => {
    const { patch } = mergeRuns(a, b);
    expect(patch.cadence).toBe(164); // (160*900 + 170*600) / 1500
    expect(patch.hr).toEqual({ avg: 144, max: 175, z: [0, 600, 900, 0, 0] });
  });
  it('sem tempo em uma das duas, nenhum ponto leva tempo; sem subida em uma, a soma é nula', () => {
    const old = run({ client_id: 'c', started_at: '2026-11-17T10:00:00Z', route: [[[-2355000, -4665000], [-2354900, -4665000]]], elev_gain_m: null });
    const { patch } = mergeRuns(a, old);
    expect(patch.route.every(seg => seg.every(p => p.length === 2))).toBe(true);
    expect(patch.elev_gain_m).toBeNull();
  });
  it('tipos diferentes viram livre', () => {
    expect(mergeRuns({ ...a, kind: 'leve' }, { ...b, kind: 'longao' }).patch.kind).toBe('livre');
    expect(mergeRuns({ ...a, kind: 'leve' }, { ...b, kind: 'leve' }).patch.kind).toBe('leve');
  });
});
