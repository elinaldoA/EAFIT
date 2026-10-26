// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

const h = vi.hoisted(() => ({ saveSetState: vi.fn(), toast: vi.fn() }));

vi.mock('../context/useWorkout', () => ({ useWorkout: () => ({ saveSetState: h.saveSetState }) }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));

import RunSessionHost from './RunSessionHost';
import { setSession, endSession, getGps } from '../lib/runSession';

const RUN = { nome: 'Corrida Leve (Trote)', dia: 'Segunda' };
const geo = { watchPosition: vi.fn(), clearWatch: vi.fn() };
let onOk;
let sentinel;
let wakeRequest;

const fix = (lat, t, accuracy = 5) => ({ coords: { latitude: lat, longitude: 0, accuracy }, timestamp: t });
const flush = () => act(async () => { await Promise.resolve(); });
const back = () => act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });

beforeEach(() => {
  localStorage.clear();
  endSession();
  vi.useFakeTimers();
  h.saveSetState.mockReset().mockResolvedValue('w1');
  h.toast.mockReset();
  geo.watchPosition.mockReset().mockImplementation(ok => { onOk = ok; return 9; });
  geo.clearWatch.mockReset();
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
  sentinel = { released: false, release: vi.fn().mockImplementation(() => { sentinel.released = true; return Promise.resolve(); }) };
  wakeRequest = vi.fn().mockImplementation(() => Promise.resolve(sentinel));
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: wakeRequest } });
});
afterEach(() => {
  cleanup();
  endSession();
  // o history.back() do guarda ao sair dispara popstate de forma assíncrona: deixa
  // chegar, senão o contador de "voltar" ignorados do hook vaza para o teste seguinte
  act(() => { vi.advanceTimersByTime(100); });
  vi.useRealTimers();
  delete navigator.geolocation;
  delete navigator.wakeLock;
});

describe('RunSessionHost — sem corrida', () => {
  it('não pede GPS nem tela acesa e não bloqueia nada', async () => {
    render(<RunSessionHost />);
    await flush();
    expect(geo.watchPosition).not.toHaveBeenCalled();
    expect(wakeRequest).not.toHaveBeenCalled();
    const ev = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    back();
    expect(h.toast).not.toHaveBeenCalled();
  });
});

describe('RunSessionHost — GPS fora da tela de treino', () => {
  it('rastreia sozinho, sem nenhum CardioRow montado, e grava a distância', () => {
    render(<RunSessionHost />);
    act(() => { setSession({ ...RUN, running: true, gps: true }); });
    expect(geo.watchPosition).toHaveBeenCalled();
    act(() => { onOk(fix(0, 0)); onOk(fix(0.0001, 4000)); onOk(fix(0.0002, 8000)); });
    expect(localStorage.getItem('set_Corrida Leve (Trote)_1_distancia')).toBe('0.02');
    act(() => { vi.advanceTimersByTime(900); });
    expect(h.saveSetState).toHaveBeenCalledWith('Segunda', 'Corrida Leve (Trote)', 1, { distancia_km: 0.02 });
  });

  it('continua somando a partir da distância já registrada', () => {
    localStorage.setItem('set_Corrida Leve (Trote)_1_distancia', '3');
    render(<RunSessionHost />);
    act(() => { setSession({ ...RUN, running: true, gps: true }); });
    act(() => { onOk(fix(0, 0)); onOk(fix(0.0001, 4000)); });
    expect(localStorage.getItem('set_Corrida Leve (Trote)_1_distancia')).toBe('3.01');
  });

  it('publica o estado do GPS para a linha do treino mostrar', () => {
    render(<RunSessionHost />);
    act(() => { setSession({ ...RUN, running: true, gps: true }); });
    expect(getGps().status).toBe('searching');
    act(() => { onOk(fix(0, 0, 8)); });
    expect(getGps()).toEqual({ status: 'tracking', accuracy: 8 });
  });

  it('pausar solta o GPS; sem a opção de GPS não rastreia', () => {
    render(<RunSessionHost />);
    act(() => { setSession({ ...RUN, running: true, gps: true }); });
    act(() => { setSession({ running: false }); });
    expect(geo.clearWatch).toHaveBeenCalledWith(9);
    geo.watchPosition.mockClear();
    act(() => { setSession({ running: true, gps: false }); });
    expect(geo.watchPosition).not.toHaveBeenCalled();
  });
});

describe('RunSessionHost — app reaberto no meio da corrida', () => {
  it('retoma GPS e tela acesa sozinho, só com a sessão guardada (nenhuma linha de treino montada)', async () => {
    localStorage.setItem('set_Corrida Leve (Trote)_1_distancia', '2.5');
    setSession({ ...RUN, running: true, gps: true });
    render(<RunSessionHost />);
    await flush();
    expect(geo.watchPosition).toHaveBeenCalled();
    expect(wakeRequest).toHaveBeenCalledWith('screen');
    act(() => { onOk(fix(0, 0)); onOk(fix(0.0001, 4000)); });
    expect(localStorage.getItem('set_Corrida Leve (Trote)_1_distancia')).toBe('2.51');
  });

  it('sessão pausada ao reabrir não liga nada', async () => {
    setSession({ ...RUN, running: false, gps: true });
    render(<RunSessionHost />);
    await flush();
    expect(geo.watchPosition).not.toHaveBeenCalled();
    expect(wakeRequest).not.toHaveBeenCalled();
  });
});

describe('RunSessionHost — tela acesa', () => {
  it('mantém a tela acesa enquanto corre, com ou sem GPS, e solta ao parar', async () => {
    render(<RunSessionHost />);
    act(() => { setSession({ ...RUN, running: true, gps: false }); });
    await flush();
    expect(wakeRequest).toHaveBeenCalledWith('screen');
    act(() => { endSession(); });
    await flush();
    expect(sentinel.release).toHaveBeenCalled();
  });
});

describe('RunSessionHost — proteção contra sair', () => {
  it('fechar ou recarregar a página pede confirmação durante a corrida e deixa de pedir ao pausar', () => {
    render(<RunSessionHost />);
    act(() => { setSession({ ...RUN, running: true, gps: false }); });
    const during = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(during);
    expect(during.defaultPrevented).toBe(true);

    act(() => { setSession({ running: false }); });
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it('o "voltar" não sai do app: avisa e continua protegido nas vezes seguintes', () => {
    render(<RunSessionHost />);
    act(() => { setSession({ ...RUN, running: true, gps: false }); });
    back();
    expect(h.toast).toHaveBeenCalledWith('🏃 Corrida em andamento — pause ou pare o cronômetro para sair');
    back();
    back();
    expect(h.toast).toHaveBeenCalledTimes(3);
  });

  it('depois de pausar, o "voltar" volta a funcionar normalmente', () => {
    render(<RunSessionHost />);
    act(() => { setSession({ ...RUN, running: true, gps: false }); });
    act(() => { setSession({ running: false }); });
    h.toast.mockClear();
    back();
    expect(h.toast).not.toHaveBeenCalled();
  });
});
