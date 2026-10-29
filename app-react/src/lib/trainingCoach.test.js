import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ db: {} }));

import {
  missedDays, sorePlannedMuscles, exerciseReadings, weekVolume, hardWeekStreak, isDeloadWeek, weeksToDeload, buildTrainingCoach, weekBehind,
} from './trainingCoach';

// 2026-10-29 é quinta-feira; a semana começou no domingo 25.
const TODAY = '2026-10-29';
const ex = (nome, series = '3', reps = '8-12') => ({ nome, series, reps, descanso: '60s', tecnica: '' });
const day = (dia, foco, exercicios) => ({ dia, foco, exercicios, pos: [] });
const set = (exercise_name, carga, reps, workout_date) => ({ exercise_name, carga, reps, workout_date });

const SEG = day('Segunda', 'Peito', [ex('Supino Reto')]);
const QUA = day('Quarta', 'Costas', [ex('Remada Curvada')]);
const QUI = day('Quinta', 'Pernas', [ex('Agachamento'), ex('Leg Press')]);
const SEX = day('Sexta', 'Ombros', [ex('Desenvolvimento')]);

describe('missedDays', () => {
  it('lista os dias do plano já passados sem treino, do mais recente ao mais antigo', () => {
    const done = new Set(['Segunda']);
    const out = missedDays([SEG, QUA, QUI, SEX, day('Terça', 'Descanso', [])], TODAY, d => done.has(d));
    expect(out.map(d => d.dia)).toEqual(['Quarta']);
  });

  it('não conta o dia de hoje nem os que vêm depois', () => {
    expect(missedDays([QUI, SEX], TODAY, () => false)).toEqual([]);
  });
});

describe('sorePlannedMuscles', () => {
  it('aponta músculo do dia que levou 4+ séries ontem', () => {
    const sets = Array.from({ length: 4 }, () => set('Agachamento Búlgaro', 20, 10, '2026-10-28'));
    expect(sorePlannedMuscles(QUI, sets, TODAY)).toEqual(['quads']);
  });

  it('ignora volume pequeno ou de outro dia', () => {
    const sets = [set('Agachamento', 80, 10, '2026-10-28'), ...Array.from({ length: 5 }, () => set('Leg Press', 100, 10, '2026-10-26'))];
    expect(sorePlannedMuscles(QUI, sets, TODAY)).toEqual([]);
  });
});

describe('exerciseReadings', () => {
  it('separa quem bateu o topo das reps de quem travou', () => {
    const sets = [
      set('Agachamento', 80, 12, '2026-10-22'), set('Agachamento', 80, 12, '2026-10-22'),
      ...['2026-10-08', '2026-10-15', '2026-10-22'].map(d => set('Leg Press', 150, 9, d)),
    ];
    const { ready, stuck } = exerciseReadings(QUI, sets, TODAY);
    expect(ready.map(r => [r.nome, r.suggestedCarga])).toEqual([['Agachamento', 82.5]]);
    expect(stuck.map(s => [s.nome, s.suggestedDeload])).toEqual([['Leg Press', 135]]);
  });

  it('não usa as séries de hoje: a leitura não muda no meio do treino', () => {
    const sets = [set('Agachamento', 80, 10, '2026-10-22'), set('Agachamento', 85, 12, TODAY)];
    expect(exerciseReadings(QUI, sets, TODAY).ready).toEqual([]);
  });
});

describe('weekVolume', () => {
  it('compara a semana até hoje com o mesmo trecho da semana passada', () => {
    const sets = [
      set('Supino Reto', 50, 10, '2026-10-26'), // 500 nesta semana
      set('Supino Reto', 40, 10, '2026-10-19'), // 400 até quinta passada
      set('Supino Reto', 100, 10, '2026-10-23'), // sexta passada: fora da comparação
    ];
    expect(weekVolume(sets, TODAY)).toEqual({ now: 500, before: 400, deltaPct: 25 });
  });

  it('sem semana passada não há comparação', () => {
    expect(weekVolume([set('Supino Reto', 50, 10, '2026-10-26')], TODAY).deltaPct).toBeNull();
  });
});

describe('hardWeekStreak', () => {
  // Um treino de volume `kg` na segunda de `weeksBack` semanas atrás.
  const week = (weeksBack, kg) => set('Supino Reto', kg, 1, ['2026-10-26', '2026-10-19', '2026-10-12', '2026-10-05', '2026-09-28', '2026-09-21', '2026-09-14', '2026-09-07'][weeksBack]);

  it('conta as semanas puxadas seguidas antes da atual', () => {
    const sets = [1, 2, 3, 4, 5].map(w => week(w, 1000));
    expect(hardWeekStreak(sets, TODAY)).toBe(5);
    expect(isDeloadWeek(5)).toBe(true);
    expect(weeksToDeload(5)).toBe(0);
  });

  it('semana vazia ou bem mais leve que o normal zera a sequência', () => {
    expect(hardWeekStreak([1, 2, 4, 5].map(w => week(w, 1000)), TODAY)).toBe(2);
    const deloaded = [week(1, 1000), week(2, 1000), week(3, 500), week(4, 1000), week(5, 1000), week(6, 1000)];
    expect(hardWeekStreak(deloaded, TODAY)).toBe(2);
    expect(weeksToDeload(2)).toBe(3);
    expect(isDeloadWeek(2)).toBe(false);
  });

  it('a semana atual não entra na conta; sem histórico é zero', () => {
    expect(hardWeekStreak([week(0, 1000)], TODAY)).toBe(0);
    expect(hardWeekStreak([], TODAY)).toBe(0);
  });
});

describe('weekBehind', () => {
  it('lista músculos do plano com menos de 5 séries nos últimos 7 dias', () => {
    const sets = Array.from({ length: 6 }, () => set('Supino Reto', 60, 10, '2026-10-26'));
    expect(weekBehind([SEG, QUA], sets, TODAY)).toEqual(['back']);
  });
});

describe('buildTrainingCoach', () => {
  const pending = { hasSets: true, done: false, started: false, quick: false };
  const ready = [{ nome: 'Agachamento', suggestedCarga: 82.5, lastCarga: 80, lastReps: 12, hitCeiling: true }];
  const stuck = [{ nome: 'Leg Press', lastCarga: 150, suggestedDeload: 135, sessionsStuck: 3 }];

  it('energia e sono baixos vêm primeiro e oferecem a versão curta', () => {
    const c = buildTrainingCoach({ today: pending, checkin: { energy: 1, sleep: 2 }, readings: { ready, stuck: [] } });
    expect(c.kind).toBe('low_energy');
    expect(c.offerQuick).toBe(true);
    expect(c.notes).toEqual([]); // sem sugestão de subir carga num dia ruim
  });

  it('não oferece a versão curta se o treino já começou', () => {
    const c = buildTrainingCoach({ today: { ...pending, started: true }, checkin: { energy: 1, sleep: 1 } });
    expect(c.offerQuick).toBe(false);
  });

  it('músculo cansado de ontem vence a sugestão de subir carga', () => {
    const c = buildTrainingCoach({ today: pending, sore: ['quads'], readings: { ready, stuck: [] } });
    expect(c.kind).toBe('sore');
    expect(c.notes.map(n => n.kind)).toEqual(['up']);
  });

  it('semana de deload esconde as sugestões de carga', () => {
    const c = buildTrainingCoach({ today: pending, readings: { ready, stuck }, hardWeeks: 5 });
    expect(c).toMatchObject({ kind: 'deload_week', weeks: 5, notes: [] });
  });

  it('três platôs pedem uma semana leve', () => {
    const three = ['A', 'B', 'C'].map(nome => ({ ...stuck[0], nome }));
    expect(buildTrainingCoach({ today: pending, readings: { ready: [], stuck: three } }).kind).toBe('deload_plateaus');
  });

  it('mostra quem sobe carga e quem travou, com energia alta virando dia de recorde', () => {
    const c = buildTrainingCoach({ today: pending, checkin: { energy: 5, sleep: 4 }, readings: { ready, stuck } });
    expect(c).toMatchObject({ kind: 'ready', count: 1, energized: true });
    expect(c.notes.map(n => [n.kind, n.nome])).toEqual([['up', 'Agachamento'], ['stuck', 'Leg Press']]);
  });

  it('dormiu mal: some a sugestão de subir carga, mas o platô continua', () => {
    const c = buildTrainingCoach({ today: pending, checkin: { energy: 4, sleep: 2 }, readings: { ready, stuck } });
    expect(c.kind).toBeNull();
    expect(c.notes.map(n => n.kind)).toEqual(['stuck']);
  });

  it('sem nada a dizer, não aparece', () => {
    expect(buildTrainingCoach({ today: pending, checkin: { energy: 5, sleep: 5 }, readings: { ready: [], stuck: [] } })).toBeNull();
    expect(buildTrainingCoach({ today: pending, readings: { ready: [], stuck: [] } })).toBeNull();
  });

  it('treino feito lembra o dia perdido e o músculo atrasado', () => {
    const c = buildTrainingCoach({ today: { ...pending, done: true }, missed: [QUA], behind: ['back', 'biceps', 'calves'] });
    expect(c.kind).toBe('done');
    expect(c.notes).toEqual([{ kind: 'missed_tomorrow', day: QUA }, { kind: 'behind', muscles: ['back', 'biceps'] }]);
  });

  it('dia livre com treino perdido oferece recuperar', () => {
    const rest = { hasSets: false, done: false, started: false, quick: false };
    expect(buildTrainingCoach({ today: rest, missed: [QUA, SEG] })).toMatchObject({ kind: 'catchup', day: QUA });
    expect(buildTrainingCoach({ today: null, missed: [QUA] })).toMatchObject({ kind: 'catchup', day: QUA });
    expect(buildTrainingCoach({ today: rest })).toBeNull();
  });
});
