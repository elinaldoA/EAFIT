// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  startRun, pauseRun, resumeRun, elapsedMs, isPaused, setDistance, splitsOf, finishRun,
  getLiveRun, setLiveRun, updateLiveRun, isRunActive, resetLiveRunCache, STALE_MS,
  autoPauseRun, autoResumeRun, markRunSeen, interruptedSince, INTERRUPTED_MS, addElevation, addSteps,
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
  it('leva os tiros do intervalado; sem tiros, intervals é null', () => {
    const base = startRun({ gps: false }, T0);
    expect(finishRun(base, { now: T0 + 450_000 }).intervals).toBeNull();
    const withReps = { ...base, reps: [{ rep: 1, s: 98, m: 400 }, { rep: 1, s: 90, m: 400 }, { rep: 2, s: 0, m: 5 }] };
    expect(finishRun(withReps, { now: T0 + 450_000 }).intervals).toEqual([{ rep: 1, s: 98, m: 400 }]);
  });

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

describe('pausa automática', () => {
  it('para o cronômetro no último movimento e volta sozinha', () => {
    let s = startRun({ gps: true }, T0);
    s = setDistance(s, 500, T0 + 150_000);
    s = autoPauseRun(s, T0 + 150_000, T0 + 162_000);
    expect(isPaused(s)).toBe(true);
    expect(s.autoPaused).toBe(true);
    expect(elapsedMs(s, T0 + 200_000)).toBe(150_000);
    expect(s.routeBreak).toBe(false);
    s = autoResumeRun(s, T0 + 200_000);
    expect(s.autoPaused).toBe(false);
    expect(elapsedMs(s, T0 + 210_000)).toBe(160_000);
  });

  it('não para antes do começo do trecho; a pausa manual cancela a automática', () => {
    let s = startRun({ gps: true }, T0);
    s = autoPauseRun(s, T0 - 50_000, T0 + 20_000);
    expect(elapsedMs(s, T0 + 30_000)).toBe(0);
    s = pauseRun(s, T0 + 30_000);
    expect(s.autoPaused).toBe(false);
    expect(autoResumeRun(s, T0 + 40_000)).toBe(s);
  });

  it('conta como corrida ativa (o app não recarrega)', () => {
    setLiveRun(autoPauseRun(startRun({ gps: true }, Date.now() - 60_000), Date.now() - 20_000));
    expect(isRunActive()).toBe(true);
  });
});

describe('app fechado no meio da corrida', () => {
  it('avisa quando a corrida rodando ficou sem o app aberto', () => {
    const now = Date.now();
    const s = { ...startRun({}, now - 3_600_000), updatedAt: now - 3_600_000 };
    markRunSeen(s, now - 1_800_000);
    expect(interruptedSince(s, now)).toBe(now - 1_800_000);
    markRunSeen(s, now - INTERRUPTED_MS + 1000);
    expect(interruptedSince(s, now)).toBeNull();
  });

  it('corrida pausada ou marca de outra corrida não contam', () => {
    const now = Date.now();
    const s = { ...startRun({}, now - 3_600_000), updatedAt: now - 3_600_000 };
    expect(interruptedSince(pauseRun(s, now - 3_000_000), now)).toBeNull();
    markRunSeen({ id: 'outra' }, now);
    expect(interruptedSince(s, now)).toBe(now - 3_600_000);
  });
});

describe('subida, cadência e tênis no registro', () => {
  it('leva a subida do GPS, a cadência média e o tênis', () => {
    let s = startRun({ gps: true }, T0);
    s = addElevation(s, 100, 5);
    for (let i = 1; i <= 120; i++) s = addElevation(s, 100 + i * 0.25, 5);
    s = addSteps(s, 150, 60_000);
    s = addSteps(s, 130, 40_000);
    s = setDistance(s, 1500, T0 + 500_000);
    const r = finishRun(s, { now: T0 + 500_000, shoeId: 'tenis-1' });
    expect(r.elev_gain_m).toBeGreaterThan(15);
    expect(r.cadence).toBe(168);
    expect(r.shoe_id).toBe('tenis-1');
  });

  it('sem GPS, sem passos suficientes ou sem tênis: null', () => {
    let s = startRun({ gps: false }, T0);
    s = addElevation(s, 100, 5);
    s = addSteps(s, 20, 10_000);
    const r = finishRun(s, { now: T0 + 60_000 });
    expect(r).toMatchObject({ elev_gain_m: null, cadence: null, shoe_id: null });
  });

  it('pausada não conta altitude', () => {
    const s = pauseRun(startRun({ gps: true }, T0), T0 + 1000);
    expect(addElevation(s, 100, 5)).toBe(s);
  });
});
