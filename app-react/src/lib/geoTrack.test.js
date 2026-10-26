import { describe, it, expect } from 'vitest';
import { haversineM, emptyTrack, resetAnchor, applyFix, MAX_SKIPS } from './geoTrack';

// 0,0001° de latitude ≈ 11,1 m
const at = (dLat, t, accuracy = 5, lon = 0) => ({ lat: dLat, lon, accuracy, t });
const run = (fixes, start = emptyTrack()) => fixes.reduce((tr, f) => applyFix(tr, f).track, start);

describe('haversineM', () => {
  it('um milésimo de grau de latitude são ~111 m', () => {
    expect(haversineM({ lat: 0, lon: 0 }, { lat: 0.001, lon: 0 })).toBeCloseTo(111.19, 0);
  });

  it('ponto igual dá zero e a distância é simétrica', () => {
    const a = { lat: -23.55, lon: -46.63 };
    const b = { lat: -23.56, lon: -46.64 };
    expect(haversineM(a, a)).toBe(0);
    expect(haversineM(a, b)).toBeCloseTo(haversineM(b, a), 6);
  });
});

describe('applyFix', () => {
  it('a primeira leitura só ancora, sem somar distância', () => {
    const r = applyFix(emptyTrack(), at(0, 0));
    expect(r).toMatchObject({ accepted: true, reason: 'first' });
    expect(r.track.meters).toBe(0);
  });

  it('soma o deslocamento entre leituras', () => {
    const tr = run([at(0, 0), at(0.0001, 4000), at(0.0002, 8000)]);
    expect(tr.meters).toBeCloseTo(22.2, 0);
  });

  it('descarta leitura com precisão ruim', () => {
    const tr = run([at(0, 0)]);
    const r = applyFix(tr, at(0.0005, 4000, 80));
    expect(r).toMatchObject({ accepted: false, reason: 'accuracy' });
    expect(r.track.last).toBe(tr.last);
    expect(applyFix(emptyTrack(), { lat: 0, lon: 0, t: 0 }).reason).toBe('accuracy'); // sem precisão informada
  });

  it('deriva parado (deslocamento pequeno) não soma', () => {
    const tr = run([at(0, 0), at(0.00002, 2000), at(-0.00001, 4000), at(0.00002, 6000)]);
    expect(tr.meters).toBe(0);
  });

  it('o passo mínimo cresce com a imprecisão da leitura', () => {
    const tr = run([at(0, 0)]);
    expect(applyFix(tr, at(0.00008, 4000, 25)).reason).toBe('drift'); // ~9 m < 12,5 m
    expect(applyFix(tr, at(0.00008, 4000, 5)).reason).toBe('moved');
  });

  it('movimento lento acumula: a âncora não anda quando a leitura é recusada', () => {
    // 3 m por leitura não passa no filtro (mínimo 4 m); a leitura seguinte, já a
    // 6 m da âncora, passa e soma o trecho todo — nada se perde
    const slow = [at(0, 0), at(0.000027, 3000), at(0.000054, 6000), at(0.000081, 9000), at(0.000108, 12000)];
    expect(applyFix(applyFix(emptyTrack(), slow[0]).track, slow[1]).reason).toBe('drift');
    expect(run(slow).meters).toBeCloseTo(12, 0);
  });

  it('salto impossível de velocidade é recusado', () => {
    const tr = run([at(0, 0)]);
    const r = applyFix(tr, at(0.01, 2000)); // ~1,1 km em 2 s
    expect(r).toMatchObject({ accepted: false, reason: 'speed' });
    expect(r.track.meters).toBe(0);
  });

  it('depois de várias leituras seguidas no novo lugar, reancora sem somar o salto', () => {
    let tr = run([at(0, 0)]);
    let last;
    for (let i = 1; i <= MAX_SKIPS; i++) {
      last = applyFix(tr, at(0.01, i * 2000));
      tr = last.track;
    }
    expect(last).toMatchObject({ accepted: true, reason: 'jump' });
    expect(tr.meters).toBe(0);
    expect(applyFix(tr, at(0.0101, (MAX_SKIPS + 2) * 2000)).reason).toBe('moved');
  });

  it('tempo que não avança é recusado', () => {
    const tr = run([at(0, 1000)]);
    expect(applyFix(tr, at(0.0005, 1000)).reason).toBe('time');
    expect(applyFix(tr, at(0.0005, 500)).reason).toBe('time');
  });
});

describe('resetAnchor', () => {
  it('mantém o total mas esquece a posição: o trecho da pausa não conta', () => {
    const tr = resetAnchor(run([at(0, 0), at(0.0001, 4000)]));
    expect(tr.last).toBeNull();
    const meters = tr.meters;
    const next = applyFix(tr, at(0.5, 600000)); // longe, depois de uma pausa longa
    expect(next.reason).toBe('first');
    expect(next.track.meters).toBe(meters);
  });
});
