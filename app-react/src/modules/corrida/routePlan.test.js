// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  planDistanceM, estimateSeconds, averagePace, addPlanPoint, closeLoop, outAndBack, buildPlanGpx,
  planView, panCenter, MAX_PLAN_POINTS,
} from './routePlan';

const A = { lat: -23.55, lon: -46.63 };
const B = { lat: -23.54, lon: -46.63 }; // ~1,11 km ao norte
const C = { lat: -23.54, lon: -46.62 };

describe('distância e tempo', () => {
  it('soma os trechos em linha reta', () => {
    const d = planDistanceM([A, B]);
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1120);
    expect(planDistanceM([A, B, C])).toBeGreaterThan(d);
    expect(planDistanceM([A])).toBe(0);
    expect(planDistanceM([])).toBe(0);
  });
  it('tempo no ritmo; sem ritmo ou distância, nada', () => {
    expect(estimateSeconds(10000, 360)).toBe(3600);
    expect(estimateSeconds(0, 360)).toBeNull();
    expect(estimateSeconds(5000, null)).toBeNull();
  });
  it('ritmo médio ponderado pela distância, só com GPS', () => {
    const runs = [
      { gps: true, distance_m: 5000, duration_s: 1500 },
      { gps: true, distance_m: 10000, duration_s: 3300 },
      { gps: false, distance_m: 5000, duration_s: 100 },
    ];
    expect(averagePace(runs)).toBe(Math.round(4800 / 15));
    expect(averagePace([])).toBeNull();
    expect(averagePace(undefined)).toBeNull();
  });
});

describe('editar o percurso', () => {
  it('adiciona pontos, ignora repetido e respeita o limite', () => {
    let pts = addPlanPoint([], A);
    expect(pts).toHaveLength(1);
    expect(addPlanPoint(pts, A)).toBe(pts);
    pts = addPlanPoint(pts, { lat: -23.549999, lon: -46.629999 });
    expect(pts[1]).toEqual({ lat: -23.55, lon: -46.63 });
    const full = Array.from({ length: MAX_PLAN_POINTS }, (_, i) => ({ lat: i / 1000, lon: 0 }));
    expect(addPlanPoint(full, { lat: 1, lon: 1 })).toBe(full);
  });
  it('fecha o circuito uma vez só', () => {
    const loop = closeLoop([A, B, C]);
    expect(loop).toHaveLength(4);
    expect(loop.at(-1)).toEqual(A);
    expect(closeLoop(loop)).toBe(loop);
    expect(closeLoop([A])).toEqual([A]);
  });
  it('ida e volta repete o caminho ao contrário', () => {
    const r = outAndBack([A, B, C]);
    expect(r).toEqual([A, B, C, B, A]);
    expect(Math.abs(planDistanceM(r) - planDistanceM([A, B, C]) * 2)).toBeLessThanOrEqual(2);
    expect(outAndBack([A])).toEqual([A]);
  });
});

describe('GPX da rota', () => {
  it('gera rtept em ordem e escapa o nome', () => {
    const gpx = buildPlanGpx([A, B], 'Rota <1> & "teste"');
    expect(gpx).toContain('<rte>');
    expect(gpx).toContain('Rota &lt;1&gt; &amp; &quot;teste&quot;');
    expect(gpx.match(/<rtept /g)).toHaveLength(2);
    expect(gpx.indexOf('-23.55000')).toBeLessThan(gpx.indexOf('-23.54000'));
  });
  it('o GPX volta a ser lido como percurso (xml válido)', () => {
    const doc = new DOMParser().parseFromString(buildPlanGpx([A, B, C]), 'application/xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.getElementsByTagName('rtept')).toHaveLength(3);
  });
});

describe('vista do mapa', () => {
  it('o centro cai no meio do quadro e o toque no meio devolve o centro', () => {
    const v = planView(A, 14, 320, 240);
    const [x, y] = v.place(A);
    expect(x).toBeCloseTo(160, 0);
    expect(y).toBeCloseTo(120, 0);
    const back = v.invert(160, 120);
    expect(back.lat).toBeCloseTo(A.lat, 4);
    expect(back.lon).toBeCloseTo(A.lon, 4);
    expect(v.tiles.length).toBeGreaterThanOrEqual(4);
  });
  it('place e invert são inversos em outro ponto', () => {
    const v = planView(A, 15, 300, 300);
    const [x, y] = v.place(B);
    const p = v.invert(x, y);
    expect(p.lat).toBeCloseTo(B.lat, 4);
    expect(p.lon).toBeCloseTo(B.lon, 4);
  });
  it('zoom fica entre 3 e 18', () => {
    expect(planView(A, 99, 100, 100).zoom).toBe(18);
    expect(planView(A, -4, 100, 100).zoom).toBe(3);
  });
  it('arrastar para a direita leva o centro para o oeste', () => {
    const c = panCenter(A, 14, 100, 0);
    expect(c.lon).toBeLessThan(A.lon);
    expect(c.lat).toBeCloseTo(A.lat, 6);
    const down = panCenter(A, 14, 0, 100);
    expect(down.lat).toBeGreaterThan(A.lat);
  });
});
