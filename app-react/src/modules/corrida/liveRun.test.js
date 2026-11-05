// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  startRun, pauseRun, resumeRun, elapsedMs, isPaused, setDistance, splitsOf, finishRun,
  getLiveRun, setLiveRun, updateLiveRun, isRunActive, resetLiveRunCache, STALE_MS,
} from './liveRun';

const T0 = new Date(2026, 10, 5, 7, 0, 0).getTime();

beforeEach(() => {
  localStorage.clear();
  resetLiveRunCache();
});

describe('cronômetro', () => {
  it('conta só o tempo correndo, não o pausado', () => {
    let s = startRun({}, T0);
    s = pauseRun(s, T0 + 60_000);
    expect(isPaused(s)).toBe(true);
    expect(elapsedMs(s, T0 + 600_000)).toBe(60_000);
    s = resumeRun(s, T0 + 120_000);
    expect(elapsedMs(s, T0 + 180_000)).toBe(120_000);
  });

  it('pausar duas vezes ou retomar sem pausa não muda nada', () => {
    const s = startRun({}, T0);
    expect(resumeRun(s, T0 + 5)).toBe(s);
    const p = pauseRun(s, T0 + 10);
    expect(pauseRun(p, T0 + 20)).toBe(p);
  });
});

describe('distância e splits', () => {
  it('marca cada km cruzado, interpolando entre as leituras', () => {
    let s = startRun({}, T0);
    s = setDistance(s, 900, T0 + 270_000);   // 900 m em 4:30
    s = setDistance(s, 1100, T0 + 330_000);  // cruza o 1º km no meio do trecho (5:00)
    expect(s.kmMarks).toEqual([300_000]);
    s = setDistance(s, 2100, T0 + 630_000);  // 1000 m em 5:00: o 2º km cai a 90% do trecho
    expect(splitsOf(s.kmMarks)).toEqual([300, 300]);
  });

  it('um salto grande marca vários km de uma vez; distância menor é ignorada', () => {
    let s = startRun({}, T0);
    s = setDistance(s, 3000, T0 + 900_000);
    expect(s.kmMarks).toHaveLength(3);
    expect(setDistance(s, 2500, T0 + 950_000)).toBe(s);
  });
});

describe('finishRun', () => {
  it('monta o registro com duração, distância, splits e sessão', () => {
    let s = startRun({ gps: true, session: { type: 'longao', minutes: 40, week: 3, dayIndex: 5 } }, T0);
    s = setDistance(s, 1000, T0 + 300_000);
    s = setDistance(s, 1500, T0 + 450_000);
    const r = finishRun(s, { now: T0 + 450_000, effort: 6, notes: '  ótimo  ' });
    expect(r).toMatchObject({
      client_id: s.id, run_date: '2026-11-05', duration_s: 450, distance_m: 1500,
      splits: [300], kind: 'longao', program_week: 3, program_day: 5, gps: true, effort: 6, notes: 'ótimo',
    });
  });

  it('distância corrigida à mão apaga os splits e o GPS; esforço inválido some', () => {
    let s = startRun({ gps: true }, T0);
    s = setDistance(s, 1200, T0 + 400_000);
    const r = finishRun(s, { now: T0 + 400_000, meters: 3000, effort: 42 });
    expect(r).toMatchObject({ distance_m: 3000, splits: [], gps: false, effort: null, kind: 'livre', notes: null });
  });
});

describe('loja no aparelho', () => {
  it('guarda, lê de novo depois de recarregar e apaga', () => {
    setLiveRun(startRun({}, Date.now()));
    resetLiveRunCache();
    expect(getLiveRun()).not.toBeNull();
    expect(isRunActive()).toBe(true);
    updateLiveRun(s => pauseRun(s));
    expect(isRunActive()).toBe(false);
    setLiveRun(null);
    resetLiveRunCache();
    expect(getLiveRun()).toBeNull();
  });

  it('corrida esquecida há muito tempo não volta', () => {
    const old = { ...startRun({}, 0), updatedAt: Date.now() - STALE_MS - 1 };
    localStorage.setItem('eafit_live_run', JSON.stringify(old));
    expect(getLiveRun()).toBeNull();
  });
});
