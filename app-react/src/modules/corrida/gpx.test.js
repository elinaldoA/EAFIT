// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildGpx, parseGpx, runFromGpx, gpxFilename } from './gpx';

const T0 = Date.UTC(2026, 10, 5, 10, 0, 0);
const iso = s => new Date(T0 + s * 1000).toISOString();

// Corrida a 5:00/km indo para o norte (≈ 3 m/s): um ponto a cada 5 s.
function gpx({ points = 400, pauseAt = null, jumpAt = null, withTime = true, ele = null } = {}) {
  let t = 0;
  const pts = [];
  for (let i = 0; i < points; i++) {
    if (pauseAt === i) t += 120;
    const lat = -23.5 + (i * 15) / 111320 + (jumpAt === i ? 0.05 : 0);
    const time = withTime ? `<time>${iso(t)}</time>` : '';
    const e = ele ? `<ele>${ele(i)}</ele>` : '';
    pts.push(`<trkpt lat="${lat.toFixed(6)}" lon="-46.600000">${e}${time}</trkpt>`);
    t += 5;
  }
  return `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Parque</name><trkseg>${pts.join('')}</trkseg></trk></gpx>`;
}

describe('importar GPX', () => {
  it('calcula distância, tempo, tempo por km e título', () => {
    const { record, error } = runFromGpx(parseGpx(gpx()), { now: T0 + 1e7 });
    expect(error).toBeUndefined();
    expect(record.distance_m).toBeGreaterThan(5900);
    expect(record.distance_m).toBeLessThan(6100);
    expect(record.duration_s).toBe(1995);
    expect(record.splits).toHaveLength(5);
    expect(record.splits[0]).toBeGreaterThan(330);
    expect(record.splits[0]).toBeLessThan(336);
    expect(record).toMatchObject({ title: 'Parque', gps: true, kind: 'livre', visibility: 'amigos', run_date: '2026-11-05' });
    expect(record.client_id).toMatch(/^gpx-/);
  });

  it('o início e o fim do percurso não são salvos (privacidade)', () => {
    const { record } = runFromGpx(parseGpx(gpx()), { now: T0 + 1e7 });
    const pts = record.route.flat();
    expect(pts.length).toBeGreaterThan(50);
    // O primeiro ponto salvo fica a ~200 m do começo (≈ 0,0018 grau).
    expect(Math.abs(pts[0][0] / 1e5 - -23.5)).toBeGreaterThan(0.0017);
  });

  it('pausa longa não entra no tempo nem na distância e abre trecho novo', () => {
    const plain = runFromGpx(parseGpx(gpx()), { now: T0 + 1e7 }).record;
    const paused = runFromGpx(parseGpx(gpx({ pauseAt: 200 })), { now: T0 + 1e7 }).record;
    expect(paused.duration_s).toBe(plain.duration_s - 5);
    expect(paused.route.length).toBeGreaterThanOrEqual(1);
  });

  it('salto de GPS não vira distância', () => {
    const { record } = runFromGpx(parseGpx(gpx({ jumpAt: 200 })), { now: T0 + 1e7 });
    expect(record.distance_m).toBeLessThan(6200);
  });

  it('soma a subida quando o arquivo tem altitude', () => {
    const { record } = runFromGpx(parseGpx(gpx({ ele: i => 100 + i * 0.1 })), { now: T0 + 1e7 });
    expect(record.elev_gain_m).toBeGreaterThan(20);
  });

  it('o mesmo arquivo importado de novo dá o mesmo client_id', () => {
    const a = runFromGpx(parseGpx(gpx()), { now: T0 + 1e7 }).record;
    const b = runFromGpx(parseGpx(gpx()), { now: T0 + 2e7 }).record;
    expect(a.client_id).toBe(b.client_id);
  });

  it('recusa arquivo inválido, sem horário, curto, no futuro ou grande demais', () => {
    expect(runFromGpx(parseGpx('isso não é xml'), {}).error).toMatch(/não parece um GPX/);
    expect(runFromGpx(parseGpx('<gpx><trk><trkseg><trkpt lat="1" lon="1"/></trkseg></trk></gpx>'), {}).error).toMatch(/não parece um GPX/);
    expect(runFromGpx(parseGpx(gpx({ withTime: false })), {}).error).toMatch(/horário/);
    expect(runFromGpx(parseGpx(gpx({ points: 6 })), { now: T0 + 1e7 }).error).toMatch(/curto/);
    expect(runFromGpx(parseGpx(gpx()), { now: T0 - 1e7 }).error).toMatch(/futuro/);
  });

  it('usa o nome do arquivo quando a trilha não tem nome', () => {
    const text = gpx().replace('<name>Parque</name>', '');
    expect(runFromGpx(parseGpx(text), { fileName: 'Corrida de sábado.gpx', now: T0 + 1e7 }).record.title).toBe('Corrida de sábado');
  });
});

describe('exportar GPX', () => {
  const run = {
    started_at: iso(0), run_date: '2026-11-05', title: 'Longão <1> & "tal"',
    route: [[[-2350000, -4660000, 0], [-2349900, -4660000, 33]], [[-2349000, -4660000, 400], [-2348900, -4660000, 430]]],
  };

  it('gera um GPX válido com um trkseg por trecho e o horário de cada ponto', () => {
    const text = buildGpx(run);
    const parsed = parseGpx(text);
    expect(parsed.name).toBe('Longão <1> & "tal"');
    expect(parsed.segments).toHaveLength(2);
    expect(parsed.segments[0][1].time - parsed.segments[0][0].time).toBe(33000);
    expect(parsed.segments[1][0].lat).toBeCloseTo(-23.49, 5);
    expect(text).toContain('creator="EAFIT Run"');
  });

  it('percurso antigo sem horário sai sem <time> e o nome do arquivo usa a data', () => {
    const old = { ...run, route: [[[-2350000, -4660000], [-2349900, -4660000]]] };
    expect(buildGpx(old)).not.toContain('<time>' + iso(33));
    expect(gpxFilename(run)).toBe('eafit-run-2026-11-05.gpx');
  });

  it('ida e volta: o que exporta pode ser importado', () => {
    const exported = buildGpx({ ...run, route: runFromGpx(parseGpx(gpx()), { now: T0 + 1e7 }).record.route });
    expect(parseGpx(exported).segments.flat().length).toBeGreaterThan(50);
  });
});
