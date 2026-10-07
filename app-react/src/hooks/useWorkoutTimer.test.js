// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useWorkoutTimer } from './useWorkoutTimer';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('useWorkoutTimer', () => {
  it('começa parado e sem tempo', () => {
    const { result } = renderHook(() => useWorkoutTimer('Segunda'));
    expect(result.current.status).toBe('idle');
    expect(result.current.elapsedMs).toBe(0);
  });

  it('start devolve o instante de início e passa a contar', () => {
    const { result } = renderHook(() => useWorkoutTimer('Segunda'));
    let startedAt;
    act(() => { startedAt = result.current.start(); });
    expect(startedAt).toBe(Date.now());
    expect(result.current.status).toBe('running');
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.elapsedMs).toBe(5000);
  });

  it('pause congela o tempo e resume retoma de onde parou', () => {
    const { result } = renderHook(() => useWorkoutTimer('Segunda'));
    act(() => { result.current.start(); });
    act(() => { vi.advanceTimersByTime(4000); });
    act(() => { result.current.pause(); });
    expect(result.current.status).toBe('paused');
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current.elapsedMs).toBe(4000);

    act(() => { result.current.resume(); });
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.elapsedMs).toBe(7000);
  });

  it('pause fora de "running" e resume fora de "paused" não fazem nada', () => {
    const { result } = renderHook(() => useWorkoutTimer('Segunda'));
    act(() => { result.current.pause(); });
    act(() => { result.current.resume(); });
    expect(result.current.status).toBe('idle');
  });

  it('finish devolve o tempo acumulado e congela; sem sessão devolve null', () => {
    const { result } = renderHook(() => useWorkoutTimer('Segunda'));
    expect(result.current.finish()).toBeNull();

    let startedAt;
    act(() => { startedAt = result.current.start(); });
    act(() => { vi.advanceTimersByTime(9000); });
    let res;
    act(() => { res = result.current.finish(); });
    expect(res).toMatchObject({ accumulatedMs: 9000, startedAt });
    expect(res.finishedAt).toBe(Date.now());
    expect(result.current.status).toBe('finished');
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.elapsedMs).toBe(9000);
  });

  it('finish estando pausado não soma o tempo parado', () => {
    const { result } = renderHook(() => useWorkoutTimer('Segunda'));
    act(() => { result.current.start(); });
    act(() => { vi.advanceTimersByTime(2000); });
    act(() => { result.current.pause(); });
    act(() => { vi.advanceTimersByTime(60_000); });
    let res;
    act(() => { res = result.current.finish(); });
    expect(res.accumulatedMs).toBe(2000);
  });

  it('reset volta ao início', () => {
    const { result } = renderHook(() => useWorkoutTimer('Segunda'));
    act(() => { result.current.start(); });
    act(() => { result.current.finish(); });
    act(() => { result.current.reset(); });
    expect(result.current.status).toBe('idle');
    expect(result.current.elapsedMs).toBe(0);
  });

  it('sobrevive a recarregar: o estado vem do aparelho e segue contando', () => {
    const first = renderHook(() => useWorkoutTimer('Segunda'));
    act(() => { first.result.current.start(); });
    act(() => { vi.advanceTimersByTime(6000); });
    first.unmount();

    const { result } = renderHook(() => useWorkoutTimer('Segunda'));
    expect(result.current.status).toBe('running');
    expect(result.current.elapsedMs).toBe(6000);
  });

  it('cada dia tem o seu cronômetro', () => {
    const seg = renderHook(() => useWorkoutTimer('Segunda'));
    act(() => { seg.result.current.start(); });
    const ter = renderHook(() => useWorkoutTimer('Terça'));
    expect(ter.result.current.status).toBe('idle');
  });

  it('estado corrompido no aparelho cai em "parado"', () => {
    localStorage.setItem('treino_Segunda_timer', '{quebrado');
    const { result } = renderHook(() => useWorkoutTimer('Segunda'));
    expect(result.current.status).toBe('idle');
  });
});
