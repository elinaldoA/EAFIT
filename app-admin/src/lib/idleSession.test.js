import { describe, it, expect } from 'vitest';
import { idleState, readLastActivity, writeLastActivity, IDLE_MS, WARN_MS } from './idleSession';

describe('idleState', () => {
  const t0 = 1_000_000;
  it('ativo enquanto falta mais que o aviso', () => {
    expect(idleState(t0, t0 + 1000).status).toBe('active');
  });
  it('avisa nos últimos WARN_MS com os segundos que faltam', () => {
    expect(idleState(t0, t0 + IDLE_MS - 30_000)).toEqual({ status: 'warning', secondsLeft: 30 });
    expect(idleState(t0, t0 + IDLE_MS - WARN_MS).status).toBe('warning');
  });
  it('expira no limite e depois dele (notebook que dormiu)', () => {
    expect(idleState(t0, t0 + IDLE_MS).status).toBe('expired');
    expect(idleState(t0, t0 + IDLE_MS * 5).status).toBe('expired');
  });
});

describe('última atividade', () => {
  it('grava e lê; sem valor usa o fallback', () => {
    localStorage.clear();
    expect(readLastActivity(42)).toBe(42);
    writeLastActivity(777);
    expect(readLastActivity(42)).toBe(777);
  });
});
