// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { daysBefore, periodStart, kindsIn, filterRuns, readFilters, writeFilters, FILTERS_KEY } from './runFilter';

const run = (run_date, kind = 'livre') => ({ client_id: run_date + kind, run_date, kind });
const today = '2026-11-17';

describe('filtros do histórico', () => {
  it('conta os dias para trás, virando o mês e o ano', () => {
    expect(daysBefore('2026-11-17', 30)).toBe('2026-10-18');
    expect(daysBefore('2026-01-05', 10)).toBe('2025-12-26');
    expect(periodStart('tudo', today)).toBeNull();
    expect(periodStart('ano', today)).toBe('2026-01-01');
    expect(periodStart('90', today)).toBe('2026-08-19');
  });

  it('só oferece os tipos que existem, na ordem do app', () => {
    expect(kindsIn([run('2026-11-01', 'longao'), run('2026-11-02'), run('2026-11-03', 'longao')])).toEqual(['longao', 'livre']);
    expect(kindsIn([{ run_date: '2026-11-01' }])).toEqual(['livre']); // sem kind = livre
  });

  it('filtra por período e por tipo, juntos', () => {
    const runs = [run('2026-11-10', 'longao'), run('2026-10-01', 'longao'), run('2026-11-12'), run('2025-12-30')];
    expect(filterRuns(runs, {}, today)).toHaveLength(4);
    expect(filterRuns(runs, { period: '30' }, today).map(r => r.run_date)).toEqual(['2026-11-10', '2026-11-12']);
    expect(filterRuns(runs, { period: 'ano' }, today)).toHaveLength(3);
    expect(filterRuns(runs, { kind: 'longao' }, today)).toHaveLength(2);
    expect(filterRuns(runs, { period: '30', kind: 'longao' }, today).map(r => r.run_date)).toEqual(['2026-11-10']);
  });

  it('inclui o primeiro dia do período', () => {
    expect(filterRuns([run('2026-10-18')], { period: '30' }, today)).toHaveLength(1);
    expect(filterRuns([run('2026-10-17')], { period: '30' }, today)).toHaveLength(0);
  });
});

describe('filtros guardados no aparelho', () => {
  beforeEach(() => localStorage.clear());

  it('sem nada guardado, abre em Tudo e todos os tipos', () => {
    expect(readFilters()).toEqual({ period: 'tudo', kind: null });
  });

  it('lembra a última escolha', () => {
    writeFilters({ period: '90', kind: 'longao' });
    expect(readFilters()).toEqual({ period: '90', kind: 'longao' });
  });

  it('voltar ao padrão apaga o que estava guardado', () => {
    writeFilters({ period: '30', kind: null });
    writeFilters({ period: 'tudo', kind: null });
    expect(localStorage.getItem(FILTERS_KEY)).toBeNull();
  });

  it('ignora valor guardado inválido ou corrompido', () => {
    localStorage.setItem(FILTERS_KEY, JSON.stringify({ period: '7', kind: 'voando' }));
    expect(readFilters()).toEqual({ period: 'tudo', kind: null });
    localStorage.setItem(FILTERS_KEY, '{quebrado');
    expect(readFilters()).toEqual({ period: 'tudo', kind: null });
    localStorage.setItem(FILTERS_KEY, 'null');
    expect(readFilters()).toEqual({ period: 'tudo', kind: null });
  });
});
