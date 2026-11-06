import { describe, it, expect } from 'vitest';
import { runProfileStats, parseWeeklyKm, weeklyKmGoal, programSummary } from './runProfileStats';

// Sexta, 6/11/2026 (segunda da semana: 2/11).
const TODAY = '2026-11-06';
const run = (run_date, distance_m = 5000) => ({ run_date, distance_m });

describe('estatísticas do Perfil', () => {
  it('soma os km da semana atual e o total', () => {
    const s = runProfileStats([run('2026-11-02', 5000), run('2026-11-05', 7300), run('2026-10-28', 10000)], TODAY);
    expect(s.weekMeters).toBe(12300);
    expect(s.totalMeters).toBe(22300);
  });

  it('sequência = semanas seguidas com corrida; semana atual sem corrida ainda não quebra', () => {
    const lastTwo = [run('2026-10-27'), run('2026-10-20')];
    expect(runProfileStats(lastTwo, TODAY).streakWeeks).toBe(2);
    expect(runProfileStats([run('2026-11-03'), ...lastTwo], TODAY).streakWeeks).toBe(3);
  });

  it('uma semana sem corrida no meio quebra a sequência', () => {
    expect(runProfileStats([run('2026-11-03'), run('2026-10-20')], TODAY).streakWeeks).toBe(1);
    expect(runProfileStats([run('2026-10-13')], TODAY).streakWeeks).toBe(0);
    expect(runProfileStats([], TODAY)).toEqual({ weekMeters: 0, totalMeters: 0, streakWeeks: 0 });
  });

  it('semana inteira em modo pausa é pulada sem quebrar nem somar', () => {
    const runs = [run('2026-11-03'), run('2026-10-27'), run('2026-10-13')];
    // Semana de 19/10 inteira em pausa: conta 2/11, 26/10 e 12/10 (a pausada não soma).
    expect(runProfileStats(runs, TODAY, [{ from: '2026-10-19', to: '2026-10-25' }]).streakWeeks).toBe(3);
    // Pausa só de parte da semana não ajuda: a sequência quebra ali.
    expect(runProfileStats(runs, TODAY, [{ from: '2026-10-19', to: '2026-10-22' }]).streakWeeks).toBe(2);
    expect(runProfileStats(runs, TODAY).streakWeeks).toBe(2);
  });
});

describe('meta semanal de km', () => {
  it('aceita vazio (sem meta), vírgula e de 1 a 300 km', () => {
    expect(parseWeeklyKm('')).toEqual({ km: null });
    expect(parseWeeklyKm('  ')).toEqual({ km: null });
    expect(parseWeeklyKm('20')).toEqual({ km: 20 });
    expect(parseWeeklyKm('12,5')).toEqual({ km: 12.5 });
    expect(parseWeeklyKm('0')).toEqual({ error: true });
    expect(parseWeeklyKm('301')).toEqual({ error: true });
    expect(parseWeeklyKm('abc')).toEqual({ error: true });
  });

  it('lê a meta guardada na conta', () => {
    expect(weeklyKmGoal({ runWeeklyKm: 25 })).toBe(25);
    expect(weeklyKmGoal({ runWeeklyKm: '15,5' })).toBe(15.5);
    expect(weeklyKmGoal({ runWeeklyKm: null })).toBeNull();
    expect(weeklyKmGoal({})).toBeNull();
    expect(weeklyKmGoal(undefined)).toBeNull();
  });
});

describe('resumo do programa', () => {
  it('convida a montar, mostra a semana e avisa quando concluiu', () => {
    expect(programSummary({}, TODAY)).toMatch(/Sem programa/);
    expect(programSummary({ runGoal: '10k', runNivel: 'intermediario', runStart: '2026-10-12' }, TODAY)).toBe('10K · semana 4 de 10');
    expect(programSummary({ runGoal: '5k', runNivel: 'intermediario', runStart: '2026-08-03' }, TODAY)).toMatch(/concluído/);
  });
});
