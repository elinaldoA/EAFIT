import { describe, it, expect } from 'vitest';
import { parseFit } from './fit';

const FIT_EPOCH_MS = Date.UTC(1989, 11, 31);
const SEMI = 2 ** 31 / 180;

// Monta um FIT mínimo: definição da mensagem record (20) e uma mensagem de dados por ponto.
function buildFit(points, { little = true, compressed = false } = {}) {
  const fields = [[253, 4, 0x86], [0, 4, 0x85], [1, 4, 0x85], [2, 2, 0x84], [3, 1, 2], [4, 1, 2]];
  const chunks = [];
  const def = [0x40, 0, little ? 0 : 1];
  const u16 = n => (little ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff]);
  def.push(...u16(20), fields.length);
  for (const [num, size, type] of fields) def.push(num, size, type);
  chunks.push(Uint8Array.from(def));
  points.forEach((p, i) => {
    const buf = new ArrayBuffer(4 + 4 + 4 + 2 + 1 + 1);
    const v = new DataView(buf);
    v.setUint32(0, p.t, little);
    v.setInt32(4, p.lat == null ? 0x7fffffff : Math.round(p.lat * SEMI), little);
    v.setInt32(8, p.lon == null ? 0x7fffffff : Math.round(p.lon * SEMI), little);
    v.setUint16(12, p.alt == null ? 0xffff : Math.round((p.alt + 500) * 5), little);
    v.setUint8(14, p.hr ?? 0xff);
    v.setUint8(15, p.cad ?? 0xff);
    chunks.push(Uint8Array.from([compressed && i % 2 ? 0x80 : 0x00]), new Uint8Array(buf));
  });
  const data = chunks.reduce((n, c) => n + c.length, 0);
  const file = new Uint8Array(14 + data + 2);
  file[0] = 14;
  file[1] = 0x20;
  new DataView(file.buffer).setUint32(4, data, true);
  file.set([0x2e, 0x46, 0x49, 0x54], 8); // ".FIT"
  let at = 14;
  for (const c of chunks) { file.set(c, at); at += c.length; }
  return file.buffer;
}

const t0 = Math.round((Date.UTC(2026, 10, 17, 10, 0, 0) - FIT_EPOCH_MS) / 1000);
const pts = Array.from({ length: 30 }, (_, i) => ({ t: t0 + i * 5, lat: -23.55 + i * 0.0003, lon: -46.65, alt: 760 + i * 0.5, hr: 150 + (i % 5), cad: 85 }));

describe('importar FIT', () => {
  it('lê posição, altitude e horário dos pontos', () => {
    const out = parseFit(buildFit(pts));
    expect(out.segments).toHaveLength(1);
    const first = out.segments[0][0];
    expect(first.lat).toBeCloseTo(-23.55, 5);
    expect(first.lon).toBeCloseTo(-46.65, 5);
    expect(first.ele).toBeCloseTo(760, 0);
    expect(first.time).toBe(Date.UTC(2026, 10, 17, 10, 0, 0));
    expect(out.segments[0][29].time - first.time).toBe(29 * 5000);
  });
  it('frequência cardíaca (média e máxima) e cadência em passos por minuto', () => {
    const out = parseFit(buildFit(pts));
    expect(out.hr).toEqual({ avg: 152, max: 154 });
    expect(out.cadence).toBe(170); // 85 passadas × 2
  });
  it('funciona nas duas ordens de bytes', () => {
    const out = parseFit(buildFit(pts, { little: false }));
    expect(out.segments[0]).toHaveLength(30);
    expect(out.segments[0][5].lat).toBeCloseTo(-23.55 + 5 * 0.0003, 5);
  });
  it('ponto sem posição (túnel) não entra no percurso, mas a frequência conta', () => {
    const withGap = pts.map((p, i) => (i === 10 ? { ...p, lat: null, lon: null } : p));
    const out = parseFit(buildFit(withGap));
    expect(out.segments[0]).toHaveLength(29);
    expect(out.hr).not.toBeNull();
  });
  it('sem frequência ou cadência no arquivo: nulos', () => {
    const out = parseFit(buildFit(pts.map(p => ({ ...p, hr: null, cad: null }))));
    expect(out.hr).toBeNull();
    expect(out.cadence).toBeNull();
  });
  it('não é FIT, é pequeno demais ou não tem percurso: null', () => {
    expect(parseFit(new ArrayBuffer(4))).toBeNull();
    expect(parseFit(new TextEncoder().encode('<gpx></gpx>and more text here').buffer)).toBeNull();
    expect(parseFit(buildFit(pts.slice(0, 1)))).toBeNull();
    expect(parseFit('texto')).toBeNull();
  });
  it('arquivo cortado no meio vale até onde foi lido', () => {
    const full = buildFit(pts);
    const cut = full.slice(0, full.byteLength - 40);
    const out = parseFit(cut);
    expect(out.segments[0].length).toBeGreaterThan(20);
    expect(out.segments[0].length).toBeLessThan(30);
  });
});
