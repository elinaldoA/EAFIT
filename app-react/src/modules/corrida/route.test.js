import { describe, it, expect } from 'vitest';
import { addPoint, trimRoute, cleanRoute, projectRoute, countPoints, MAX_POINTS } from './route';
import { haversineM } from './geoTrack';
import { startRun, pauseRun, resumeRun, addRoutePoint, finishRun, setDistance } from './liveRun';

// 0,0001° de latitude ≈ 11,1 m: uma reta para o norte, um ponto a cada ~11 m.
const line = (n, lat0 = -23.55, lon = -46.63) => Array.from({ length: n }, (_, i) => [lat0 + i * 0.0001, lon]);
const build = pts => pts.reduce((r, [la, lo]) => addPoint(r, la, lo), []);

describe('addPoint', () => {
  it('guarda em inteiros de 1e-5 grau e pula ponto colado no anterior', () => {
    let r = addPoint([], -23.55, -46.63);
    r = addPoint(r, -23.55002, -46.63); // ~2 m: fica de fora
    r = addPoint(r, -23.5501, -46.63);  // ~11 m: entra
    expect(r).toEqual([[[-2355000, -4663000], [-2355010, -4663000]]]);
  });

  it('trecho novo depois da pausa e limite de pontos', () => {
    const r = addPoint(build(line(3)), -23.6, -46.6, true);
    expect(r).toHaveLength(2);
    const full = [Array.from({ length: MAX_POINTS }, (_, i) => [i, i])];
    expect(addPoint(full, -23.7, -46.7)).toBe(full);
    expect(countPoints(full)).toBe(MAX_POINTS);
  });
});

describe('trimRoute (privacidade)', () => {
  it('tira 200 m do começo e do fim', () => {
    const r = build(line(100)); // ~1,1 km
    const trimmed = trimRoute(r);
    const deg = p => ({ lat: p[0] / 1e5, lon: p[1] / 1e5 });
    expect(haversineM(deg(r[0][0]), deg(trimmed[0][0]))).toBeGreaterThanOrEqual(200);
    expect(haversineM(deg(r[0].at(-1)), deg(trimmed.at(-1).at(-1)))).toBeGreaterThanOrEqual(200);
  });

  it('corrida curta demais fica sem percurso', () => {
    expect(trimRoute(build(line(40)))).toEqual([]); // ~430 m < 600 m
    expect(trimRoute(null)).toEqual([]);
  });
});

describe('cleanRoute e projectRoute', () => {
  it('descarta lixo vindo do banco', () => {
    expect(cleanRoute('x')).toEqual([]);
    expect(cleanRoute([[[1, 2], [3, 'a'], [5, 6]], [[1, 1]], 'z'])).toEqual([[[1, 2], [5, 6]]]);
  });

  it('cabe no quadro com a margem e marca início e fim', () => {
    const d = projectRoute(build(line(50)), 300, 200, 10);
    expect(d.paths).toHaveLength(1);
    expect(d.paths[0].startsWith('M')).toBe(true);
    for (const [x, y] of [d.start, d.end]) {
      expect(x).toBeGreaterThanOrEqual(10); expect(x).toBeLessThanOrEqual(290);
      expect(y).toBeGreaterThanOrEqual(10); expect(y).toBeLessThanOrEqual(190);
    }
    expect(d.start[1]).toBeGreaterThan(d.end[1]); // norte fica em cima
    expect(projectRoute([], 300, 200)).toBeNull();
  });
});

describe('percurso na corrida ao vivo', () => {
  it('pausa abre trecho novo; pausada não grava ponto', () => {
    const T = 1_000_000;
    let s = startRun({ gps: true }, T);
    for (const [la, lo] of line(5)) s = addRoutePoint(s, la, lo, { now: T });
    s = pauseRun(s, T + 1000);
    expect(addRoutePoint(s, -23.0, -46.0)).toBe(s);
    s = resumeRun(s, T + 2000);
    s = addRoutePoint(s, -23.549, -46.63, { now: T + 3000 });
    expect(s.route).toHaveLength(2);
  });

  it('o registro salvo leva o percurso já cortado; sem GPS, vazio', () => {
    const T = 1_000_000;
    let s = startRun({ gps: true }, T);
    for (const [la, lo] of line(100)) s = addRoutePoint(s, la, lo, { now: T });
    s = setDistance(s, 1100, T + 400_000);
    const saved = finishRun(s, { now: T + 400_000 });
    expect(countPoints(saved.route)).toBeLessThan(countPoints(s.route));
    expect(countPoints(saved.route)).toBeGreaterThan(0);
    expect(finishRun(startRun({ gps: false }, T), { now: T + 1000 }).route).toEqual([]);
  });
});
