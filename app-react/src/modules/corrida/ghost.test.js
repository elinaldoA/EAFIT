import { describe, it, expect } from 'vitest';
import { ghostFrom, ghostTimeAt, ghostGapS, sameRoute, bestOnSameRoute } from './ghost';

// 5 km em 25:00, km 1 a 5 em 300 s cada.
const five = { client_id: 'a', title: 'Parque', run_date: '2026-10-01', duration_s: 1500, distance_m: 5000, splits: [300, 300, 300, 300, 300] };

describe('fantasma', () => {
  it('só vale corrida com tempo e pelo menos 500 m', () => {
    expect(ghostFrom(null)).toBeNull();
    expect(ghostFrom({ ...five, distance_m: 300 })).toBeNull();
    expect(ghostFrom({ ...five, duration_s: 0 })).toBeNull();
    expect(ghostFrom(five)).toMatchObject({ id: 'a', title: 'Parque', duration_s: 1500, distance_m: 5000, splits: [300, 300, 300, 300, 300] });
  });

  it('tempo do fantasma na distância: interpola entre os km', () => {
    const g = ghostFrom(five);
    expect(ghostTimeAt(g, 0)).toBe(0);
    expect(ghostTimeAt(g, 1000)).toBe(300);
    expect(ghostTimeAt(g, 2500)).toBe(750);
    expect(ghostTimeAt(g, 5000)).toBe(1500);
  });

  it('parciais diferentes entre si: usa cada km', () => {
    const g = ghostFrom({ ...five, duration_s: 1480, splits: [280, 290, 300, 310, 300] });
    expect(ghostTimeAt(g, 1500)).toBe(280 + 145);
  });

  it('depois do fim da corrida segue no ritmo médio dela', () => {
    expect(ghostTimeAt(ghostFrom(five), 6000)).toBe(1800);
  });

  it('último trecho incompleto (5,5 km) usa o que sobrou', () => {
    const g = ghostFrom({ ...five, duration_s: 1650, distance_m: 5500 });
    expect(ghostTimeAt(g, 5000)).toBe(1500);
    expect(ghostTimeAt(g, 5500)).toBe(1650);
  });

  it('sem parciais (corrida lançada à mão) vale o ritmo médio', () => {
    const g = ghostFrom({ ...five, splits: [] });
    expect(ghostTimeAt(g, 2500)).toBe(750);
  });

  it('parciais incoerentes com o total são ignorados', () => {
    const g = ghostFrom({ ...five, distance_m: 3000 });
    expect(ghostTimeAt(g, 1500)).toBe(750);
  });

  it('diferença: positivo = à frente do fantasma', () => {
    const g = ghostFrom(five);
    expect(ghostGapS(g, 290, 1000)).toBe(10);
    expect(ghostGapS(g, 320, 1000)).toBe(-20);
  });
});

// Quadrado de ~330 m de lado (a rota guarda inteiros de 1e-5 grau).
const loop = (lat, lon) => [[[lat, lon], [lat + 300, lon], [lat + 300, lon + 300], [lat, lon + 300]]];
const r = (id, route, distance_m, duration_s) => ({ client_id: id, route, distance_m, duration_s });

describe('mesma rota', () => {
  it('mesmo lugar e distância parecida', () => {
    const a = r('a', loop(-2300000, -4000000), 5000, 1500);
    expect(sameRoute(a, r('b', loop(-2300100, -4000100), 5200, 1400))).toBe(true);
  });

  it('lugar longe, distância diferente ou sem percurso: não', () => {
    const a = r('a', loop(-2300000, -4000000), 5000, 1500);
    expect(sameRoute(a, r('b', loop(-2310000, -4000000), 5000, 1400))).toBe(false);
    expect(sameRoute(a, r('c', loop(-2300000, -4000000), 8000, 2400))).toBe(false);
    expect(sameRoute(a, r('d', [], 5000, 1400))).toBe(false);
    expect(sameRoute(a, null)).toBe(false);
  });

  it('a melhor da rota é a mais rápida entre as parecidas; ignora fila do aparelho', () => {
    const a = r('a', loop(-2300000, -4000000), 5000, 1500);
    const faster = r('b', loop(-2300050, -4000050), 5100, 1400);
    const fasterOther = r('c', loop(-2400000, -4000000), 5000, 1000);
    const pending = { ...r('d', loop(-2300000, -4000000), 5000, 900), pending: true };
    expect(bestOnSameRoute([a, faster, fasterOther, pending], a).client_id).toBe('b');
    expect(bestOnSameRoute([a], a).client_id).toBe('a');
  });
});
