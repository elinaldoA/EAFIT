// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildTcx, tcxFilename } from './tcx';

const iso = s => new Date(Date.UTC(2026, 10, 5, 8, 0, s)).toISOString();
const run = {
  started_at: iso(0), run_date: '2026-11-05', duration_s: 1500, distance_m: 5020, notes: 'Treino <leve> & "bom"',
  hr: { avg: 150, max: 172 },
  route: [[[-2350000, -4660000, 0], [-2349900, -4660000, 33]], [[-2349000, -4660000, 400], [-2348900, -4660000, 430]]],
};
const parse = text => new DOMParser().parseFromString(text, 'application/xml');

describe('exportar TCX', () => {
  it('gera um TCX válido com tempo, distância, FC e um trecho por pausa', () => {
    const doc = parse(buildTcx(run));
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.getElementsByTagName('Activity')[0].getAttribute('Sport')).toBe('Running');
    expect(doc.getElementsByTagName('TotalTimeSeconds')[0].textContent).toBe('1500');
    expect(doc.getElementsByTagName('DistanceMeters')[0].textContent).toBe('5020');
    expect(doc.getElementsByTagName('AverageHeartRateBpm')[0].textContent.trim()).toBe('150');
    expect(doc.getElementsByTagName('Track')).toHaveLength(2);
    expect(doc.getElementsByTagName('Trackpoint')).toHaveLength(4);
    expect(doc.getElementsByTagName('Time')[1].textContent).toBe(iso(33));
    expect(doc.getElementsByTagName('Notes')[0].textContent).toBe('Treino <leve> & "bom"');
  });

  it('a distância acumulada dos pontos nunca diminui (a pausa não soma)', () => {
    const d = [...parse(buildTcx(run)).getElementsByTagName('Trackpoint')].map(p => Number(p.getElementsByTagName('DistanceMeters')[0].textContent));
    expect(d[0]).toBe(0);
    expect(d.every((v, i) => i === 0 || v >= d[i - 1])).toBe(true);
    expect(d.at(-1)).toBeGreaterThan(0);
  });

  it('sem horário nos pontos ou sem FC, sai só o resumo', () => {
    const old = { ...run, hr: null, route: [[[-2350000, -4660000], [-2349900, -4660000]]] };
    const text = buildTcx(old);
    expect(parse(text).querySelector('parsererror')).toBeNull();
    expect(text).not.toContain('Trackpoint');
    expect(text).not.toContain('HeartRate');
  });

  it('o nome do arquivo usa a data', () => {
    expect(tcxFilename(run)).toBe('eafit-run-2026-11-05.tcx');
  });
});
