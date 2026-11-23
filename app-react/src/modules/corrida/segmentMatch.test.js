import { describe, it, expect } from 'vitest';
import { pathPoints, segmentFromRun, findEffort, newEfforts, canMakeSegment, pathLengthM } from './segmentMatch';

// Reta para o norte: 1 ponto a cada 10 s e ~11 m (10 unidades de 1e-5°), pace ~ 1,1 m/s.
const line = (n, { lon = 0, t0 = 0, dt = 10 } = {}) => [Array.from({ length: n }, (_, i) => [-2355000 + i * 10, -4665000 + lon, t0 + i * dt])];
const run = (id, route, extra = {}) => ({ id, run_date: '2026-11-17', route, ...extra });

describe('percurso em fila', () => {
  it('distância acumulada e tempo de cada ponto; sem tempo nos pontos, vazio', () => {
    const pts = pathPoints(line(11));
    expect(pts).toHaveLength(11);
    expect(pts[0].cum).toBe(0);
    expect(pts.at(-1).cum).toBeGreaterThan(100);
    expect(pathPoints([[[1, 1], [2, 2]]])).toEqual([]);
    expect(pathLengthM(line(11))).toBe(pts.at(-1).cum);
  });
});

describe('criar segmento a partir de uma corrida', () => {
  const r = run('a', line(101)); // ~1,1 km

  it('pega o trecho entre duas distâncias, com a distância e o desenho', () => {
    const seg = segmentFromRun(r, 200, 700);
    expect(seg.distance_m).toBe(500);
    expect(seg.route.length).toBeGreaterThan(2);
    expect(seg.route.every(p => p.length === 2)).toBe(true);
  });
  it('curto demais, sem tempo e limite de pontos', () => {
    expect(segmentFromRun(r, 200, 250).error).toBe('curto-demais');
    expect(segmentFromRun(run('x', [[[1, 1], [2, 2]]]), 0, 500).error).toBe('sem-tempo');
    const long = segmentFromRun(run('b', line(1500)), 0, 100000); // 1500 pontos
    expect(long.route.length).toBeLessThanOrEqual(300);
  });
  it('só dá para criar com tempo nos pontos e pelo menos 100 m', () => {
    expect(canMakeSegment(r)).toBe(true);
    expect(canMakeSegment(run('x', line(5)))).toBe(false);
    expect(canMakeSegment(run('x', [[[1, 1], [2, 2]]]))).toBe(false);
  });
});

describe('tempo de uma corrida no segmento', () => {
  const base = run('base', line(101));
  const seg = { id: 's1', ...segmentFromRun(base, 200, 700) };

  it('a própria corrida de origem passa pelo segmento: o tempo é o do trecho', () => {
    const e = findEffort(seg, base);
    expect(e).not.toBeNull();
    expect(e.seconds).toBeGreaterThan(300); // ~500 m a ~1,1 m/s
    expect(e.seconds).toBeLessThan(500);
  });
  it('corrida mais rápida no mesmo lugar tem tempo menor', () => {
    const fast = run('fast', line(101, { dt: 5 }));
    expect(findEffort(seg, fast).seconds).toBeLessThan(findEffort(seg, base).seconds);
  });
  it('o tempo não conta pausas: o t de corrida já as exclui', () => {
    // pausa de 10 min no meio: t de corrida contínuo, então o tempo é igual
    expect(findEffort(seg, run('p', line(101)))?.seconds).toBe(findEffort(seg, base).seconds);
  });
  it('corrida em outro lugar, em sentido contrário ou curta demais: nada', () => {
    expect(findEffort(seg, run('far', line(101, { lon: 5000 })))).toBeNull();
    const back = [line(101)[0].slice().reverse().map((p, i) => [p[0], p[1], i * 10])];
    expect(findEffort(seg, run('back', back))).toBeNull();
    expect(findEffort(seg, run('short', line(30)))).toBeNull(); // para antes da chegada
  });
  it('atalho (distância andada bem menor que a do segmento) não vale', () => {
    // anda 200 m e pula direto para o fim do trecho: a distância andada entre as pontas é pequena demais
    const shortcut = run('sc', [[...line(101)[0].slice(0, 21), ...line(101)[0].slice(70)].map((p, i) => [p[0], p[1], i * 10])]);
    expect(findEffort(seg, shortcut)).toBeNull();
  });
  it('sem tempo nos pontos: nada', () => {
    expect(findEffort(seg, run('old', [[[-2355000, -4665000], [-2354000, -4665000]]]))).toBeNull();
    expect(findEffort({ route: [[1, 1]], distance_m: 5 }, base)).toBeNull();
  });
});

describe('esforços que faltam', () => {
  const base = run('base', line(101));
  const seg = { id: 's1', ...segmentFromRun(base, 200, 700) };
  it('calcula só o que ainda não foi calculado e ignora corrida sem id ou na fila', () => {
    const other = run('o', line(101, { dt: 8 }));
    const all = newEfforts([seg], [base, other, { ...other, id: null }, { ...other, id: 'p', pending: true }]);
    expect(all.map(e => e.run_id)).toEqual(['base', 'o']);
    expect(all[0]).toMatchObject({ segment_id: 's1', run_date: '2026-11-17' });
    expect(newEfforts([seg], [base, other], new Set(['s1:base'])).map(e => e.run_id)).toEqual(['o']);
  });
});
