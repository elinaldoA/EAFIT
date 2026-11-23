import { describe, it, expect } from 'vitest';
import { badgesFor, splitsChart, extrasOf, elevRuns, previousRuns } from './runCardData';
import { periodSummary, comparePeriod, previousRange, periodRange } from './runSummary';

const run = (id, date, km, sec, extra = {}) => ({
  client_id: id, run_date: date, started_at: `${date}T08:00:00Z`, distance_m: km * 1000, duration_s: sec,
  splits: Array.from({ length: Math.floor(km) }, () => Math.round(sec / km)), ...extra,
});

describe('selos do cartão', () => {
  const past = [run('a', '2026-10-01', 5, 1500), run('b', '2026-10-10', 6, 1900)];

  it('só conta as corridas anteriores e ignora a própria', () => {
    const me = run('c', '2026-10-20', 5, 1400);
    const prev = previousRuns(me, [...past, me, run('z', '2026-11-01', 9, 2000)]);
    expect(prev.map(r => r.client_id)).toEqual(['a', 'b']);
  });

  it('melhor 5 km: diz o tempo e quanto melhorou', () => {
    const me = run('c', '2026-10-20', 5, 1400);
    const badges = badgesFor(me, [...past, me]);
    expect(badges.map(b => b.text)).toContain('Melhor 5 km: 23:20 (1:40 mais rápido)');
  });

  it('maior distância e melhor ritmo viram selos; corrida comum não tem selo de recorde', () => {
    const big = run('c', '2026-10-20', 10, 3000);
    expect(badgesFor(big, [...past, big]).some(b => b.text.startsWith('Maior distância'))).toBe(true);
    const slow = run('d', '2026-10-20', 4, 2400);
    expect(badgesFor(slow, [...past, slow]).filter(b => /Melhor|Maior/.test(b.text))).toEqual([]);
  });

  it('sem lista de corridas carregada não afirma nada (nem "primeira corrida")', () => {
    expect(badgesFor(run('c', '2026-10-20', 5, 1400), null)).toEqual([]);
    expect(badgesFor(run('c', '2026-10-20', 5, 1400), [])).toEqual([]);
  });

  it('a primeira corrida da lista desbloqueia a conquista e no máximo 3 selos', () => {
    const first = run('c', '2026-10-20', 5, 1400);
    expect(badgesFor(first, [first]).map(b => b.text)).toContain('Primeira corrida');
    const big = run('d', '2026-10-20', 22, 6000);
    expect(badgesFor(big, [...past, big]).length).toBeLessThanOrEqual(3);
  });
});

describe('gráfico de ritmo por km', () => {
  it('precisa de 2 km; o km mais rápido tem a barra cheia', () => {
    expect(splitsChart([300], null)).toBeNull();
    const c = splitsChart([330, 300, 360], null);
    expect(c.best).toEqual({ km: 2, sec: 300 });
    expect(c.bars.map(b => b.best)).toEqual([false, true, false]);
    expect(c.bars[1].h).toBe(1);
    expect(c.bars[2].h).toBeCloseTo(0.3);
    expect(c.alt).toBeNull();
  });

  it('ritmo constante: barras iguais; subida por km vira o perfil de altitude', () => {
    expect(splitsChart([300, 300], null).bars.map(b => b.h)).toEqual([0.7, 0.7]);
    const c = splitsChart([300, 310, 320], [[20, 0], [10, 5], [0, 25]]);
    expect(c.alt).toEqual([0, 20, 25, 0]);
    // rota plana: sem perfil
    expect(splitsChart([300, 310], [[1, 1], [0, 1]]).alt).toBeNull();
  });

  it('subida e cadência em texto, só quando existem', () => {
    expect(extrasOf({ elev_gain_m: 85, cadence: 168 })).toEqual(['↗ 85 m de subida', '👣 168 passos/min']);
    expect(extrasOf({ elev_gain_m: 0, cadence: null })).toEqual([]);
  });
});

describe('percurso pintado pela subida', () => {
  const route = [[[0, 0, 10], [1, 1, 200], [2, 2, 400], [3, 3, 700]]];

  it('cada ponto leva o nível do km em que cai', () => {
    // km 1 acaba em 300 s (subida de 50 m), km 2 em 600 s (plano)
    const pieces = elevRuns(route, [300, 300], [[50, 0], [2, 2]]);
    expect(pieces.map(p => p.level)).toEqual([4, 1]);
    // a emenda entre os trechos repete o ponto, sem buraco no desenho
    expect(pieces[0].pts.at(-1)).toEqual(pieces[1].pts[0]);
  });

  it('sem tempo nos pontos ou sem subida por km não pinta', () => {
    expect(elevRuns([[[0, 0], [1, 1]]], [300], [[1, 0]])).toEqual([]);
    expect(elevRuns(route, [300, 300], null)).toEqual([]);
    expect(elevRuns(route, [300, 300], [[1, 0]])).toEqual([]);
  });
});

describe('períodos do resumo', () => {
  const r = (date, km = 5, sec = 1800) => ({ run_date: date, distance_m: km * 1000, duration_s: sec });

  it('semana começa na segunda; ano começa em janeiro', () => {
    expect(periodRange('2026-11-18', 'week')).toEqual(['2026-11-16', '2026-11-18']);
    expect(periodRange('2026-11-18', 'year')).toEqual(['2026-01-01', '2026-11-18']);
    expect(periodSummary([r('2026-03-01'), r('2026-11-17')], '2026-11-18', 'year').count).toBe(2);
    expect(periodSummary([r('2026-03-01'), r('2026-11-17')], '2026-11-18', 'week').count).toBe(1);
  });

  it('o período anterior tem os mesmos dias já passados', () => {
    expect(previousRange('2026-11-18', 'week')).toEqual(['2026-11-09', '2026-11-11']);
    expect(previousRange('2026-11-17', 'month')).toEqual(['2026-10-01', '2026-10-17']);
    expect(previousRange('2026-03-31', 'month')).toEqual(['2026-02-01', '2026-02-28']); // fevereiro não tem 31
    expect(previousRange('2026-01-15', 'month')).toEqual(['2025-12-01', '2025-12-15']);
    expect(previousRange('2026-11-17', 'year')).toEqual(['2025-01-01', '2025-11-17']);
  });

  it('compara km e ritmo com o período anterior; sem base, null', () => {
    const runs = [r('2026-11-02', 5, 1800), r('2026-11-09', 5, 1800), r('2026-10-05', 5, 1800), r('2026-10-06', 5, 1950)];
    const c = comparePeriod(runs, '2026-11-17', 'month');
    expect(c.kmPct).toBe(0);
    expect(c.paceDelta).toBe(-15); // 6:00/km contra 6:15/km
    expect(comparePeriod([r('2026-11-02')], '2026-11-17', 'month')).toBeNull();
    expect(comparePeriod([r('2026-11-02', 6), r('2026-10-02', 5)], '2026-11-17', 'month').kmPct).toBe(20);
  });
});
