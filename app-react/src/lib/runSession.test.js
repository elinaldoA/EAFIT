// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  readSession, setSession, endSession, isRunInProgress, getGps, setGps, notifyDistance, subscribe, STALE_MS,
} from './runSession';

beforeEach(() => { localStorage.clear(); endSession(); });
afterEach(() => { vi.useRealTimers(); });

describe('sessão de corrida', () => {
  it('sem sessão não há corrida em andamento', () => {
    expect(readSession()).toBeNull();
    expect(isRunInProgress()).toBe(false);
  });

  it('setSession grava, mescla os campos e marca a hora', () => {
    setSession({ nome: 'Corrida Leve (Trote)', dia: 'Segunda', running: true, gps: true });
    setSession({ running: false });
    expect(readSession()).toMatchObject({ nome: 'Corrida Leve (Trote)', dia: 'Segunda', running: false, gps: true });
    expect(readSession().updatedAt).toBeGreaterThan(0);
  });

  it('só conta como em andamento enquanto o cronômetro corre', () => {
    setSession({ nome: 'x', dia: 'Segunda', running: true });
    expect(isRunInProgress()).toBe(true);
    setSession({ running: false });
    expect(isRunInProgress()).toBe(false);
  });

  it('sobrevive a um recarregamento (fica no localStorage)', () => {
    setSession({ nome: 'x', dia: 'Terça', running: true });
    expect(JSON.parse(localStorage.getItem('eafit_run_session')).dia).toBe('Terça');
  });

  it('sessão velha (app fechado no meio da corrida) é ignorada, para não travar atualizações', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T10:00:00Z'));
    setSession({ nome: 'x', dia: 'Segunda', running: true });
    vi.setSystemTime(new Date(Date.now() + STALE_MS - 1000));
    expect(isRunInProgress()).toBe(true);
    vi.setSystemTime(new Date(Date.now() + 2000));
    expect(isRunInProgress()).toBe(false);
    expect(readSession()).toBeNull();
  });

  it('valor corrompido no storage vira "sem sessão"', () => {
    localStorage.setItem('eafit_run_session', '{nao e json');
    expect(readSession()).toBeNull();
    localStorage.setItem('eafit_run_session', JSON.stringify({ running: true }));
    expect(readSession()).toBeNull();
  });
});

describe('endSession', () => {
  it('com nome, só encerra a sessão daquele exercício', () => {
    setSession({ nome: 'A', dia: 'Segunda', running: true });
    endSession('B');
    expect(readSession()).not.toBeNull();
    endSession('A');
    expect(readSession()).toBeNull();
  });

  it('sem nome encerra qualquer uma e zera o estado do GPS', () => {
    setSession({ nome: 'A', dia: 'Segunda', running: true });
    setGps({ status: 'tracking', accuracy: 5 });
    endSession();
    expect(readSession()).toBeNull();
    expect(getGps()).toEqual({ status: 'idle', accuracy: null });
  });
});

describe('avisos aos interessados', () => {
  it('setSession, endSession, setGps e notifyDistance avisam; sem mudança no GPS não avisa', () => {
    const listener = vi.fn();
    const off = subscribe(listener);
    setSession({ nome: 'A', dia: 'Segunda', running: true });
    expect(listener).toHaveBeenCalledTimes(1);
    setGps({ status: 'searching', accuracy: null });
    expect(listener).toHaveBeenCalledTimes(2);
    setGps({ status: 'searching', accuracy: null });
    expect(listener).toHaveBeenCalledTimes(2);
    notifyDistance();
    expect(listener).toHaveBeenCalledTimes(3);
    endSession();
    expect(listener).toHaveBeenCalledTimes(4);
    off();
    setSession({ nome: 'A', dia: 'Segunda', running: true });
    expect(listener).toHaveBeenCalledTimes(4);
  });
});
