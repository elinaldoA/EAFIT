import { describe, it, expect } from 'vitest';
import { positionAt, flybyBetween, flybyCandidates } from './flybyMatch';

// Percurso para o norte, 1 ponto a cada 10 s, ~11 m por ponto (0,0001°), `n` pontos.
const walk = (n, lonOffset = 0, t0 = 0) => [Array.from({ length: n }, (_, i) => [-2355000 + i * 10, -4665000 + lonOffset, t0 + i * 10])];
const run = (id, startedAt, route) => ({ id, started_at: startedAt, route });

describe('posição no tempo', () => {
  const segs = [[[0, 0, 0], [100, 0, 100]], [[100, 0, 200], [100, 100, 300]]];
  it('interpola entre os pontos e fica fora antes do começo e depois do fim', () => {
    expect(positionAt(segs, 50)).toEqual([50, 0]);
    expect(positionAt(segs, -1)).toBeNull();
    expect(positionAt(segs, 301)).toBeNull();
  });
  it('na pausa entre dois trechos fica parado no último ponto', () => {
    expect(positionAt(segs, 150)).toEqual([100, 0]);
  });
});

describe('flyby entre duas corridas', () => {
  const t0 = '2026-11-17T08:00:00Z';

  it('lado a lado: ficam juntos o tempo todo', () => {
    const f = flybyBetween(run('a', t0, walk(31)), run('b', t0, walk(31, 20))); // ~20 m lateral
    expect(f.windowS).toBe(300);
    expect(f.togetherS).toBeGreaterThanOrEqual(295);
    expect(f.minM).toBeLessThanOrEqual(25);
    expect(f.togetherM).toBeGreaterThan(300);
    expect(f.samples.length).toBeGreaterThan(50);
  });
  it('começando em horas diferentes sem janela em comum: nada', () => {
    expect(flybyBetween(run('a', t0, walk(31)), run('b', '2026-11-17T09:00:00Z', walk(31)))).toBeNull();
  });
  it('janela curta demais (menos de 1 min) não conta', () => {
    expect(flybyBetween(run('a', t0, walk(31)), run('b', '2026-11-17T08:04:40Z', walk(31)))).toBeNull();
  });
  it('mesma hora, mas em lugares distantes: nada', () => {
    expect(flybyBetween(run('a', t0, walk(31)), run('b', t0, walk(31, 5000)))).toBeNull(); // ~500 m+ de lado
  });
  it('sem o tempo nos pontos ou sem a hora de começo: nada', () => {
    const old = [[[-2355000, -4665000], [-2354000, -4665000]]];
    expect(flybyBetween(run('a', t0, walk(31)), run('b', t0, old))).toBeNull();
    expect(flybyBetween(run('a', t0, walk(31)), { id: 'b', route: walk(31) })).toBeNull();
  });
  it('um sai mais tarde: a janela é só a parte que os dois estavam correndo', () => {
    const f = flybyBetween(run('a', t0, walk(31)), run('b', '2026-11-17T08:02:00Z', walk(31)));
    expect(f.windowS).toBe(180); // a termina aos 300 s, b começa aos 120 s
    expect(f.minM).toBeGreaterThan(0); // b parte de onde a já passou
  });
});

describe('candidatos', () => {
  it('lista quem correu junto, do que ficou mais tempo para o que menos, e ignora a própria', () => {
    const me = run('me', '2026-11-17T08:00:00Z', walk(31));
    const close = run('c', '2026-11-17T08:00:00Z', walk(31, 15));
    const late = run('l', '2026-11-17T08:02:00Z', walk(31, 15));
    const far = run('f', '2026-11-17T08:00:00Z', walk(31, 9000));
    const out = flybyCandidates(me, [me, late, far, close]);
    expect(out.map(x => x.other.id)).toEqual(['c', 'l']);
  });
  it('sem tempo nos pontos da própria corrida: ninguém', () => {
    expect(flybyCandidates(run('me', '2026-11-17T08:00:00Z', [[[1, 1], [2, 2]]]), [run('c', '2026-11-17T08:00:00Z', walk(31))])).toEqual([]);
  });
});
