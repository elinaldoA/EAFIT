import { describe, it, expect } from 'vitest';
import { muscleRecovery, musclesIn, recoveryWindowDays, HEAVY_SETS } from './muscleRecovery';

const supino = (workout_date, n = 1) => Array.from({ length: n }, () => ({ exercise_name: 'Supino Reto com Barra', workout_date }));
const rosca = (workout_date, n = 1) => Array.from({ length: n }, () => ({ exercise_name: 'Rosca Direta', workout_date }));
const TODAY = '2026-10-14';

describe('recoveryWindowDays', () => {
  it('músculos grandes pedem 2 dias, pequenos 1, e volume alto soma 1', () => {
    expect(recoveryWindowDays('chest', 4)).toBe(2);
    expect(recoveryWindowDays('biceps', 4)).toBe(1);
    expect(recoveryWindowDays('chest', HEAVY_SETS)).toBe(3);
    expect(recoveryWindowDays('biceps', HEAVY_SETS)).toBe(2);
  });
});

describe('muscleRecovery', () => {
  it('sem treino no período: tudo "none"', () => {
    const r = muscleRecovery([], TODAY);
    expect(Object.values(r).every(x => x.state === 'none')).toBe(true);
    expect(r.chest.daysSince).toBeNull();
  });

  it('treinou hoje: descansando, e o que falta é a janela inteira', () => {
    const r = muscleRecovery(supino(TODAY, 4), TODAY);
    expect(r.chest).toMatchObject({ state: 'tired', daysSince: 0, windowDays: 2, daysLeft: 2, sets: 4, lastDate: TODAY });
  });

  it('passou metade da janela: quase pronto; passou tudo: recuperado', () => {
    expect(muscleRecovery(supino('2026-10-13', 4), TODAY).chest).toMatchObject({ state: 'recovering', daysLeft: 1 });
    expect(muscleRecovery(supino('2026-10-12', 4), TODAY).chest).toMatchObject({ state: 'ready', daysLeft: 0 });
  });

  it('músculo pequeno com volume leve fica pronto no dia seguinte', () => {
    expect(muscleRecovery(rosca('2026-10-13', 3), TODAY).biceps).toMatchObject({ state: 'ready', windowDays: 1 });
    expect(muscleRecovery(rosca(TODAY, 3), TODAY).biceps.state).toBe('tired');
  });

  it('volume alto alonga a janela: 12 séries de peito ontem ainda não é "pronto"', () => {
    expect(muscleRecovery(supino('2026-10-12', 12), TODAY).chest).toMatchObject({ state: 'recovering', windowDays: 3, daysLeft: 1 });
  });

  it('treino em dias seguidos soma o cansaço dos dois dias', () => {
    const sets = [...supino('2026-10-12', 6), ...supino('2026-10-13', 5)];
    expect(muscleRecovery(sets, TODAY).chest).toMatchObject({ windowDays: 3, sets: 5 });
    // dois dias de intervalo não somam
    const apart = [...supino('2026-10-10', 6), ...supino('2026-10-13', 5)];
    expect(muscleRecovery(apart, TODAY).chest.windowDays).toBe(2);
  });

  it('vale o treino mais recente, e treino futuro ou sem data é ignorado', () => {
    const sets = [...supino('2026-10-01', 4), ...supino('2026-10-13', 4), ...supino('2026-10-20', 4), { exercise_name: 'Supino Reto com Barra' }];
    expect(muscleRecovery(sets, TODAY).chest.lastDate).toBe('2026-10-13');
  });

  it('exercício sem músculo conhecido (mobilidade, cardio) não conta', () => {
    const r = muscleRecovery([{ exercise_name: 'Esteira', workout_date: TODAY }], TODAY);
    expect(Object.values(r).every(x => x.state === 'none')).toBe(true);
  });

  it('usa o mapa da biblioteca quando há', () => {
    const lib = new Map([['zxqv misterioso', 'glutes']]);
    expect(muscleRecovery([{ exercise_name: 'Zxqv Misterioso', workout_date: TODAY }], TODAY, lib).glutes.state).toBe('tired');
  });
});

describe('musclesIn', () => {
  it('lista os músculos de um estado, do que falta mais para o que falta menos', () => {
    const sets = [...supino(TODAY, 4), ...rosca(TODAY, 3), ...supino('2026-10-14', 0)];
    const r = muscleRecovery(sets, TODAY);
    expect(musclesIn(r, 'tired')).toEqual(['chest', 'biceps']);
    expect(musclesIn(r, 'ready')).toEqual([]);
    expect(musclesIn(r, 'none')).toContain('back');
  });
});
