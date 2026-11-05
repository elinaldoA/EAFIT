import { describe, it, expect } from 'vitest';
import { addPoint, trimRoute, cleanRoute, projectRoute, countPoints, MAX_POINTS, mapView, MAX_MAP_ZOOM, TILE_SIZE,
  applyZones, cleanZones, privateRoute, kmPoints, paceRuns, PACE_LEVELS } from './route';
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

describe('mapView (percurso sobre os blocos do mapa)', () => {
  // ~2 km para leste em São Paulo.
  const line = [Array.from({ length: 21 }, (_, i) => [-2358740, -4665760 + i * 100])];

  it('escolhe o maior zoom em que o percurso cabe e centraliza', () => {
    const v = mapView(line, 320, 170, 16);
    expect(v.z).toBeLessThanOrEqual(MAX_MAP_ZOOM);
    const [x0] = v.start;
    const [x1] = v.end;
    expect(x1 - x0).toBeLessThanOrEqual(320 - 32);
    // no zoom seguinte já não caberia
    expect((x1 - x0) * 2).toBeGreaterThan(320 - 32);
    expect((x0 + x1) / 2).toBeCloseTo(160, 0);
    expect(v.start[1]).toBeCloseTo(85, 0);
  });

  it('os blocos cobrem o quadro inteiro, sem buraco', () => {
    const v = mapView(line, 320, 170);
    const minL = Math.min(...v.tiles.map(t => t.left));
    const maxR = Math.max(...v.tiles.map(t => t.left + TILE_SIZE));
    const minT = Math.min(...v.tiles.map(t => t.top));
    const maxB = Math.max(...v.tiles.map(t => t.top + TILE_SIZE));
    expect(minL).toBeLessThanOrEqual(0);
    expect(maxR).toBeGreaterThanOrEqual(320);
    expect(minT).toBeLessThanOrEqual(0);
    expect(maxB).toBeGreaterThanOrEqual(170);
    for (const t of v.tiles) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThan(2 ** v.z);
    }
  });

  it('percurso curtinho fica no zoom máximo; sem percurso, nada', () => {
    expect(mapView([[[-2358740, -4665760], [-2358742, -4665758]]], 320, 170).z).toBe(MAX_MAP_ZOOM);
    expect(mapView([], 320, 170)).toBeNull();
  });
});

// Reta para leste: 1 ponto a cada ~10 m (100 unidades de 1e-5 grau de longitude
// no equador ≈ 11 m), com o tempo em segundos.
const timed = (n, secPerPoint = 4, lon0 = 0) => [Array.from({ length: n }, (_, i) => [0, lon0 + i * 100, i * secPerPoint])];

describe('tempo em cada ponto', () => {
  it('addPoint guarda t quando vem, e cleanRoute aceita os dois formatos', () => {
    let r = addPoint([], 0, 0, false, 0);
    r = addPoint(r, 0, 0.001, false, 12.4);
    expect(r[0][1]).toEqual([0, 100, 12]);
    expect(cleanRoute([[[0, 0], [0, 100]], [[0, 0, 1], [0, 100, 2]], [[0, 0, 1, 9], [0, 1]]])).toHaveLength(2);
  });

  it('addRoutePoint marca os segundos de corrida (sem as pausas)', () => {
    let s = startRun({ gps: true }, 0);
    s = addRoutePoint(s, 0, 0, { now: 10000 });
    s = addRoutePoint(s, 0, 0.001, { now: 20000 });
    expect(s.route[0].map(p => p[2])).toEqual([10, 20]);
  });
});

describe('zonas de privacidade', () => {
  it('tira os pontos dentro da zona e corta o trecho ali', () => {
    const route = timed(60); // ~660 m
    const zone = { lat: 0, lon: 0.003, r: 200 }; // centro a ~330 m do início
    const out = applyZones(route, [zone]);
    expect(out).toHaveLength(2);
    for (const seg of out) for (const p of seg) expect(haversineM({ lat: 0, lon: 0.003 }, { lat: p[0] / 1e5, lon: p[1] / 1e5 })).toBeGreaterThanOrEqual(200);
  });

  it('sem zonas não muda nada; zona inválida é ignorada e o raio fica entre os permitidos', () => {
    const route = timed(10);
    expect(applyZones(route, [])).toEqual(route);
    expect(cleanZones([{ lat: 'x', lon: 1 }, { lat: 1.234567, lon: 2.345678, r: 999 }])).toEqual([{ lat: 1.2346, lon: 2.3457, r: 400, name: '' }]);
  });

  it('privateRoute corta as pontas e as zonas', () => {
    const route = timed(150); // ~1,6 km
    const out = privateRoute(route, [{ lat: 0, lon: 0.008, r: 200 }]);
    const first = out[0][0];
    expect(haversineM({ lat: 0, lon: 0 }, { lat: first[0] / 1e5, lon: first[1] / 1e5 })).toBeGreaterThanOrEqual(200);
    expect(out.length).toBe(2);
  });
});

describe('marcas de km pelo tempo', () => {
  it('acha o ponto de cada km pelos splits, mesmo com o começo cortado', () => {
    const route = trimRoute(timed(300, 3)); // ~3,3 km, 3 s por ponto (~11 m)
    // splits de 270 s ≈ 90 pontos ≈ 1 km cada
    const kms = kmPoints(route, [270, 270, 270, 270]);
    expect(kms.map(k => k.km)).toEqual([1, 2, 3]); // o 4º passaria do fim do percurso
    expect(kms[0].p[1]).toBeCloseTo(9000, -1);
    expect(kms[1].p[1]).toBeCloseTo(18000, -1);
  });

  it('percurso antigo (sem t) ou sem splits: nenhuma marca', () => {
    expect(kmPoints([[[0, 0], [0, 100]]], [300])).toEqual([]);
    expect(kmPoints(timed(10), [])).toEqual([]);
  });
});

describe('ritmo por trecho', () => {
  // pontos a ~11 m (10 unidades de 1e-5 grau no equador)
  const stretch = (n, secPerPt, start) => Array.from({ length: n }, (_, i) => [0, start.lon + i * 10, start.t + i * secPerPt]);

  it('trecho bem mais lento e bem mais rápido que o ritmo da corrida mudam de cor', () => {
    const steady = stretch(200, 4, { lon: 0, t: 0 });
    const slow = stretch(40, 7, { lon: 2000, t: 800 });
    const fast = stretch(40, 2, { lon: 2400, t: 1080 });
    const runs = paceRuns([[...steady, ...slow, ...fast]]);
    const levelAt = lon => runs.find(r => r.pts.some(p => p[1] === lon)).level;
    expect(levelAt(500)).toBe(2);
    expect(levelAt(2200)).toBe(0);
    expect(levelAt(2600)).toBe(PACE_LEVELS - 1);
    expect(runs.reduce((n, r) => n + r.pts.length - 1, 0)).toBe(279);
  });

  it('ritmo constante com ruído do GPS fica no nível do meio', () => {
    const noisy = Array.from({ length: 200 }, (_, i) => [0, i * 10, i * 4 + (i % 2)]);
    expect(paceRuns([noisy]).every(r => r.level === Math.floor(PACE_LEVELS / 2))).toBe(true);
  });

  it('sem tempo nos pontos: sem cores', () => {
    expect(paceRuns([[[0, 0], [0, 100], [0, 200]]])).toEqual([]);
  });
});

describe('mapView em tela cheia (zoom e arrastar)', () => {
  const line = [Array.from({ length: 21 }, (_, i) => [-2358740, -4665760 + i * 100])];

  it('zoomDelta aproxima mantendo o centro; pan arrasta', () => {
    const fit = mapView(line, 360, 640);
    const mid = [(fit.start[0] + fit.end[0]) / 2, (fit.start[1] + fit.end[1]) / 2];
    const zoomed = mapView(line, 360, 640, 16, { zoomDelta: 1 });
    expect(zoomed.z).toBe(fit.z + 1);
    expect(zoomed.fitZ).toBe(fit.z);
    expect((zoomed.start[0] + zoomed.end[0]) / 2).toBeCloseTo(mid[0], 0);
    expect(zoomed.end[0] - zoomed.start[0]).toBeCloseTo((fit.end[0] - fit.start[0]) * 2, 0);
    const moved = mapView(line, 360, 640, 16, { pan: [50, -20] });
    expect(moved.start[0]).toBeCloseTo(fit.start[0] - 50, 0);
    expect(moved.start[1]).toBeCloseTo(fit.start[1] + 20, 0);
  });

  it('o zoom não passa do limite dos blocos', () => {
    expect(mapView(line, 360, 640, 16, { zoomDelta: 99 }).z).toBe(19);
  });
});
