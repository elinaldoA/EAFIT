import { describe, it, expect } from 'vitest';
import {
  parsePace, normalizeWorkout, buildSteps, sessionWorkout, withoutGps, needsGps, startPosition, advanceWorkout, skipStep,
  stepProgress, describeWorkout, stepAnnouncement, rollingPace, pushSample, paceAlert, paceStatus, formatAmount,
} from './workout';

const W = normalizeWorkout({ warmupMin: 10, reps: 3, work: { unit: 'm', value: 400 }, rest: { unit: 's', value: 90 }, cooldownMin: 5, targetPace: 290 });

describe('montagem do treino', () => {
  it('lê o ritmo como minutos:segundos', () => {
    expect(parsePace('5:30')).toBe(330);
    expect(parsePace('4.05')).toBe(245);
    expect(parsePace('5:75')).toBeNull();
    expect(parsePace('1:00')).toBeNull();
    expect(parsePace('')).toBeNull();
  });

  it('corrige valores fora do limite e preenche o que falta', () => {
    const w = normalizeWorkout({ reps: '99', work: { unit: 'm', value: '10' }, rest: { unit: 'x' }, warmupMin: '' });
    expect(w).toMatchObject({ reps: 30, work: { unit: 'm', value: 50 }, rest: { unit: 'm', value: 200 }, warmupMin: 0, cooldownMin: 5, targetPace: null });
  });

  it('sem nada salvo, usa o padrão (10 min, 6x 400/200, 5 min)', () => {
    expect(normalizeWorkout(undefined)).toEqual({ warmupMin: 10, reps: 6, work: { unit: 'm', value: 400 }, rest: { unit: 'm', value: 200 }, cooldownMin: 5, targetPace: null });
  });

  it('etapas: aquecimento, tiros com trote entre eles e desaquecimento', () => {
    expect(buildSteps(W).map(s => `${s.type}${s.rep || ''}`)).toEqual(['warmup', 'work1', 'rest1', 'work2', 'rest2', 'work3', 'cooldown']);
  });

  it('o intervalado e a corrida de ritmo do programa viram treino guiado', () => {
    expect(sessionWorkout({ type: 'intervalado', reps: 6 })).toMatchObject({ reps: 6, work: { unit: 'm', value: 400 }, rest: { unit: 'm', value: 200 } });
    expect(buildSteps(sessionWorkout({ type: 'ritmo', minutes: 20 })).map(s => s.type)).toEqual(['warmup', 'work', 'cooldown']);
    expect(sessionWorkout({ type: 'leve', minutes: 30 })).toBeNull();
    expect(sessionWorkout(null)).toBeNull();
  });

  it('sem GPS, metros viram tempo', () => {
    expect(needsGps(W)).toBe(true);
    const w = withoutGps(W);
    expect(w.work).toEqual({ unit: 's', value: 145 });
    expect(w.rest).toEqual({ unit: 's', value: 90 });
    expect(needsGps(w)).toBe(false);
  });

  it('descreve e anuncia', () => {
    expect(describeWorkout(W)).toBe('3x 400 m forte / 1:30 trote · alvo 4:50/km');
    expect(formatAmount('m', 1500)).toBe('1,5 km');
    expect(formatAmount('s', 120)).toBe('2 min');
    expect(stepAnnouncement(buildSteps(W)[1], 3)).toBe('Tiro 1 de 3: 400 m forte!');
    expect(stepAnnouncement(buildSteps(W)[2], 3)).toBe('Trote: 1 e 30. Respire.');
    expect(stepAnnouncement(undefined, 3)).toMatch(/concluído/);
  });
});

describe('andamento', () => {
  const steps = buildSteps(W);

  it('avança por tempo e por distância, guardando onde cada etapa começou', () => {
    let pos = startPosition();
    expect(advanceWorkout(pos, steps, 300, 900)).toBe(pos);
    pos = advanceWorkout(pos, steps, 600, 1700);           // fim do aquecimento
    expect(pos).toEqual({ index: 1, startS: 600, startM: 1700 });
    expect(stepProgress(steps[1], pos, 640, 1900).left).toBe(200);
    pos = advanceWorkout(pos, steps, 680, 2100);           // 400 m do tiro
    expect(pos).toEqual({ index: 2, startS: 680, startM: 2100 });
    pos = advanceWorkout(pos, steps, 770, 2250);           // 90 s de trote
    expect(pos.index).toBe(3);
  });

  it('pular etapa e terminar o treino', () => {
    let pos = skipStep(startPosition(), steps, 30, 100);
    expect(pos).toEqual({ index: 1, startS: 30, startM: 100 });
    pos = { index: steps.length - 1, startS: 0, startM: 0 };
    pos = advanceWorkout(pos, steps, 300, 0);
    expect(pos.index).toBe(steps.length);
    expect(skipStep(pos, steps, 400, 0)).toBe(pos);
  });
});

describe('ritmo alvo', () => {
  it('mede o ritmo dos últimos ~300 m', () => {
    let samples = [];
    for (let m = 0; m <= 1000; m += 50) samples = pushSample(samples, m * 0.3, m); // 5:00/km
    expect(rollingPace(samples)).toBe(300);
    expect(rollingPace([{ s: 0, m: 0 }, { s: 30, m: 100 }])).toBeNull();
    expect(samples.length).toBeLessThan(21);
  });

  it('avisa fora da faixa de 15 s/km, no máximo a cada minuto', () => {
    expect(paceAlert(null, 305, 300, 100).message).toBeNull();
    const slow = paceAlert(null, 330, 300, 100);
    expect(slow.message).toBe('Acelere um pouco: ritmo 5 e 30, alvo 5 e 00.');
    expect(paceAlert(slow.lastAt, 340, 300, 130).message).toBeNull();
    expect(paceAlert(slow.lastAt, 270, 300, 170).message).toMatch(/^Segure o ritmo/);
    expect(paceAlert(null, 330, null, 100).message).toBeNull();
  });

  it('cor do ritmo na tela', () => {
    expect(paceStatus(305, 300)).toBe('ok');
    expect(paceStatus(330, 300)).toBe('slow');
    expect(paceStatus(270, 300)).toBe('fast');
    expect(paceStatus(null, 300)).toBeNull();
  });
});
