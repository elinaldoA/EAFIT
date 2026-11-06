import { describe, it, expect } from 'vitest';
import { raceFromMetadata, buildRace, daysUntil, programGoalFor, suggestedStart, raceReadiness, raceStage } from './race';

// 2027-03-03 é uma quarta-feira.
const TODAY = '2027-03-03';

describe('raceFromMetadata', () => {
  it('lê a prova da conta e descarta dado inválido', () => {
    expect(raceFromMetadata({ runRace: { name: ' Cidade ', date: '2027-05-09', km: 10 } })).toEqual({ name: 'Cidade', date: '2027-05-09', km: 10 });
    expect(raceFromMetadata({ runRace: { date: 'amanhã', km: 10 } })).toBeNull();
    expect(raceFromMetadata({ runRace: { date: '2027-05-09', km: 0 } })).toBeNull();
    expect(raceFromMetadata({})).toBeNull();
  });
});

describe('buildRace', () => {
  it('aceita vírgula na distância e recusa data passada', () => {
    expect(buildRace({ date: '2027-05-09', km: '7,5', name: ' X ' }, TODAY).race).toEqual({ name: 'X', date: '2027-05-09', km: 7.5 });
    expect(buildRace({ date: '2027-03-02', km: 10 }, TODAY).error).toMatch(/passou/);
    expect(buildRace({ date: '', km: 10 }, TODAY).error).toMatch(/data/);
    expect(buildRace({ date: '2027-05-09', km: 300 }, TODAY).error).toMatch(/entre 1 e 250/);
  });
  it('permite a prova hoje', () => {
    expect(buildRace({ date: TODAY, km: 5 }, TODAY).race.date).toBe(TODAY);
  });
});

describe('contagem e etapa', () => {
  it('conta os dias', () => {
    expect(daysUntil('2027-03-10', TODAY)).toBe(7);
    expect(daysUntil(TODAY, TODAY)).toBe(0);
  });
  it('etapa: hoje, semana, em breve, longe, passou', () => {
    expect(raceStage({ date: TODAY }, TODAY)).toBe('today');
    expect(raceStage({ date: '2027-03-06' }, TODAY)).toBe('week');
    expect(raceStage({ date: '2027-03-13' }, TODAY)).toBe('soon');
    expect(raceStage({ date: '2027-05-09' }, TODAY)).toBe('far');
    expect(raceStage({ date: '2027-03-02' }, TODAY)).toBe('done');
  });
});

describe('programa para a prova', () => {
  it('escolhe o objetivo pela distância', () => {
    expect(programGoalFor(5)).toBe('5k');
    expect(programGoalFor(10)).toBe('10k');
    expect(programGoalFor(21.1)).toBe('meia');
    expect(programGoalFor(15)).toBeNull();
    expect(programGoalFor(42.195)).toBeNull();
  });
  it('começa de modo que a semana da prova seja a última (5K = 8 semanas)', () => {
    // prova no sábado 2027-05-08 (semana de 05-03): começa 7 semanas antes = 03-15.
    const r = suggestedStart({ date: '2027-05-08', km: 5 }, '5k', 'intermediario', TODAY);
    expect(r).toEqual({ start: '2027-03-15', late: false, weeks: 8 });
  });
  it('sem tempo para o programa inteiro, começa nesta semana e avisa', () => {
    const r = suggestedStart({ date: '2027-04-10', km: 5 }, '5k', 'intermediario', TODAY);
    expect(r).toMatchObject({ start: '2027-03-01', late: true });
  });
});

describe('raceReadiness', () => {
  const run = (run_date, km) => ({ run_date, distance_m: km * 1000 });
  it('usa a maior corrida e a média das últimas 4 semanas', () => {
    const r = raceReadiness([run('2027-03-01', 8), run('2027-02-20', 4), run('2027-01-01', 30)], { km: 10 }, TODAY);
    expect(r.longestKm).toBe(8);
    expect(r.weeklyKm).toBe(3);
    expect(r.pct).toBeCloseTo(0.8);
  });
  it('maratona mira o treino longo de 32 km e o preparo não passa de 100%', () => {
    expect(raceReadiness([run('2027-03-01', 40)], { km: 42.195 }, TODAY)).toMatchObject({ target: 32, pct: 1 });
    expect(raceReadiness([], { km: 10 }, TODAY).pct).toBe(0);
  });
});
