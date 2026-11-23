import { describe, it, expect } from 'vitest';
import { relativeEffort, effortLevel, loadSeries, trainingStatus } from './runLoad';

const run = (date, over = {}) => ({ run_date: date, duration_s: 3600, distance_m: 10000, ...over });

describe('esforço relativo', () => {
  it('pelas zonas de frequência: uma hora na Z2 vale 60 pontos', () => {
    const r = relativeEffort(run('2026-11-01', { hr: { avg: 140, max: 160, z: [0, 3600, 0, 0, 0] } }));
    expect(r).toEqual({ points: 60, source: 'hr', level: 'moderado' });
  });
  it('zonas mais altas pesam mais', () => {
    const easy = relativeEffort(run('x', { hr: { avg: 1, max: 1, z: [3600, 0, 0, 0, 0] } })).points;
    const hard = relativeEffort(run('x', { hr: { avg: 1, max: 1, z: [0, 0, 0, 0, 3600] } })).points;
    expect(hard).toBeGreaterThan(easy * 5);
    expect(relativeEffort(run('x', { hr: { avg: 1, max: 1, z: [0, 0, 0, 0, 3600] } })).level).toBe('extremo');
  });
  it('sem zonas usa o esforço marcado; sem nada, estima e avisa', () => {
    expect(relativeEffort(run('x', { effort: 8 })).source).toBe('esforco');
    expect(relativeEffort(run('x', { effort: 8 })).points).toBeGreaterThan(relativeEffort(run('x', { effort: 3 })).points);
    expect(relativeEffort(run('x')).source).toBe('estimado');
    expect(relativeEffort(run('x', { duration_s: 0 })).points).toBe(0);
  });
  it('faixas', () => {
    expect([10, 60, 150, 300].map(effortLevel)).toEqual(['leve', 'moderado', 'forte', 'extremo']);
  });
});

describe('forma e frescor', () => {
  const today = '2026-11-20';
  it('a série tem um ponto por dia, até hoje', () => {
    const s = loadSeries([run('2026-11-10')], today, 30);
    expect(s).toHaveLength(30);
    expect(s.at(-1).date).toBe(today);
  });
  it('depois de uma corrida forte a fadiga sobe mais rápido que a forma (frescor negativo)', () => {
    const s = loadSeries([run('2026-11-19', { effort: 9 })], today, 30);
    const last = s.at(-1);
    expect(last.fatigue).toBeGreaterThan(last.fitness);
    expect(trainingStatus(s).form).toBeLessThan(0);
  });
  it('semanas de descanso devolvem o frescor positivo', () => {
    const runs = [];
    for (let d = 1; d <= 28; d++) runs.push(run(`2026-10-${String(d).padStart(2, '0')}`, { effort: 6 }));
    const status = trainingStatus(loadSeries(runs, '2026-11-12', 60));
    expect(status.form).toBeGreaterThan(0);
  });
  it('sem corridas nos últimos 42 dias não há estado', () => {
    expect(trainingStatus(loadSeries([run('2026-01-01')], today, 60))).toBeNull();
    expect(trainingStatus(loadSeries([], today, 60))).toBeNull();
  });
});
