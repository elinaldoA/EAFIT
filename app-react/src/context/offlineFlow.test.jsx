// @vitest-environment jsdom
// Fluxo ponta a ponta do treino sem rede, com as peças reais ligadas entre si:
// WorkoutProvider (contexto + fila), SetRow (a série na tela), OfflineBanner,
// checagem de recorde e a fila de pendências. Só o servidor (db) é falso
// (src/test/fakeBackend.js) e pode ser derrubado e religado no meio do teste.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  backend: null,
  user: { id: 'u1', user_metadata: {} },
  toast: vi.fn(),
  fetchActivePlan: vi.fn(),
}));

vi.mock('../lib/supabase', async () => {
  const { createFakeBackend } = await import('../test/fakeBackend');
  h.backend = createFakeBackend();
  return { db: h.backend.db };
});
vi.mock('./useAuth', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('./useToast', () => ({ useToast: () => h.toast }));
vi.mock('../lib/workoutPlans', () => ({ fetchActivePlan: (...a) => h.fetchActivePlan(...a) }));
vi.mock('../lib/coach', () => ({ coachSay: () => {}, noteRecord: () => {}, speechExercise: n => n, speechLoad: n => String(n) }));
vi.mock('../lib/friends', () => ({ postActivity: () => Promise.resolve() }));
vi.mock('../lib/pushSubscriptions', () => ({ sendPushToSelf: () => Promise.resolve() }));

import { WorkoutProvider } from './WorkoutContext';
import SetRow from '../components/SetRow';
import OfflineBanner from '../components/OfflineBanner';

const EX = { nome: 'Supino Reto', series: '3', reps: '8-10', descanso: '60s' };
const DAY = { dia: 'Segunda', foco: 'Peito', exercicios: [EX], pos: [] };
const PLAN = { id: 'p1', name: 'Plano', days: [DAY] };
const key = (n, field) => `set_Segunda_Supino Reto_${n}_${field}`;

function App() {
  const noop = () => {};
  return (
    <WorkoutProvider>
      <OfflineBanner />
      <SetRow ex={EX} n={1} day={DAY} bump={noop} onRestStart={noop} started />
      <SetRow ex={EX} n={2} day={DAY} bump={noop} onRestStart={noop} started />
    </WorkoutProvider>
  );
}

function setNetwork(online) {
  Object.defineProperty(window.navigator, 'onLine', { value: online, configurable: true });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

// Linha `n` (1 ou 2) da série: carga, reps e o ✓.
const row = (n) => ({
  carga: screen.getAllByPlaceholderText('kg')[n - 1],
  reps: screen.getAllByPlaceholderText('reps')[n - 1],
  check: screen.getAllByRole('button', { name: '✓' })[n - 1],
});

async function registerSet(n, carga, reps) {
  const r = row(n);
  fireEvent.change(r.carga, { target: { value: carga } });
  fireEvent.blur(r.carga);
  fireEvent.change(r.reps, { target: { value: reps } });
  fireEvent.blur(r.reps);
  await act(async () => { fireEvent.click(r.check); });
}

// Fecha e reabre o app: o que sobrevive é só o localStorage, como num reload.
async function reopenApp() {
  cleanup();
  render(<App />);
  await waitFor(() => expect(h.fetchActivePlan).toHaveBeenCalled());
  await act(async () => { await new Promise(r => setTimeout(r, 30)); });
}

const banner = () => screen.queryByRole('status');
const serverSet = (n) => h.backend.state.sets.find(s => s.exercise_name === 'Supino Reto' && s.set_number === n);
const pendingQueue = () => JSON.parse(localStorage.getItem('pendingSyncQueue') || '[]');

beforeEach(() => {
  localStorage.clear();
  const { state } = h.backend;
  Object.assign(state, { reachable: true, writeLatencyMs: 0, workouts: [], sets: [], logs: [], seq: 1, calls: 0 });
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  h.toast.mockReset();
  h.fetchActivePlan.mockReset().mockResolvedValue(PLAN);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Treino sem rede — fluxo completo', () => {
  it('registra online, perde a rede, treina, reabre o app sem rede, volta a rede e nada se perde', async () => {
    // 1. Com rede: a série 1 vai para o servidor e a faixa não aparece.
    render(<App />);
    await waitFor(() => expect(h.fetchActivePlan).toHaveBeenCalled());
    await registerSet(1, '100', '8');
    await waitFor(() => expect(serverSet(1)).toMatchObject({ carga: 100, reps: 8, completed: true }));
    expect(banner()).toBeNull();

    // 2. A rede cai: a série 2 fica só no aparelho, a faixa avisa e o recorde sai na hora.
    h.backend.state.reachable = false;
    act(() => setNetwork(false));
    await registerSet(2, '110', '8');
    expect(localStorage.getItem(key(2, 'carga'))).toBe('110');
    expect(localStorage.getItem(key(2, 'done'))).toBe('true');
    await waitFor(() => expect(banner().textContent).toContain('Sem conexão — seu treino está sendo salvo no aparelho.'));
    await waitFor(() => expect(banner().textContent).toMatch(/\d+ altera(ção|ções) pendentes?/));
    expect(serverSet(2)).toBeUndefined();
    expect(pendingQueue().length).toBeGreaterThan(0);
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.stringContaining('Novo recorde')));

    // 3. Reabre o app ainda sem rede: plano vem do cache, a série 2 continua marcada e a fila segue lá.
    h.fetchActivePlan.mockRejectedValue(new Error('offline'));
    await reopenApp();
    expect(row(2).carga.value).toBe('110');
    expect(row(2).check.getAttribute('aria-pressed')).toBe('true');
    expect(banner().textContent).toContain('Sem conexão');
    expect(serverSet(2)).toBeUndefined();

    // 4. A rede volta: a fila sobe sozinha e a faixa some.
    h.fetchActivePlan.mockResolvedValue(PLAN);
    h.backend.state.reachable = true;
    act(() => setNetwork(true));
    await waitFor(() => expect(serverSet(2)).toMatchObject({ carga: 110, completed: true }));
    await waitFor(() => expect(banner()).toBeNull());
    expect(pendingQueue()).toEqual([]);

    // 5. Reabre com rede: os valores seguem os do treino, sem voltar aos antigos do servidor.
    await reopenApp();
    expect(row(1).carga.value).toBe('100');
    expect(row(2).carga.value).toBe('110');
    expect(row(2).check.getAttribute('aria-pressed')).toBe('true');
    expect(banner()).toBeNull();
  });

  it('reabrir o app com a fila cheia e a rede de volta: o servidor lento não devolve as cargas antigas', async () => {
    // Servidor com 60 kg; o aparelho tem 80 kg (e a série 2) esperando na fila.
    render(<App />);
    await waitFor(() => expect(h.fetchActivePlan).toHaveBeenCalled());
    await registerSet(1, '60', '8');
    await waitFor(() => expect(serverSet(1)).toMatchObject({ carga: 60 }));

    h.backend.state.reachable = false;
    await registerSet(2, '70', '8');
    fireEvent.change(row(1).carga, { target: { value: '80' } });
    fireEvent.blur(row(1).carga);
    await waitFor(() => expect(pendingQueue().length).toBeGreaterThan(0));
    expect(serverSet(1).carga).toBe(60);
    cleanup();

    // Abre o app de novo já com rede, mas com a escrita lenta: a leitura do
    // servidor (ainda com 60 kg) chega antes de a fila terminar de subir.
    h.backend.state.reachable = true;
    h.backend.state.writeLatencyMs = 80;
    render(<App />);
    await waitFor(() => expect(serverSet(1).carga).toBe(80), { timeout: 3000 });
    await waitFor(() => expect(serverSet(2)).toMatchObject({ carga: 70, completed: true }), { timeout: 3000 });
    await waitFor(() => expect(banner()).toBeNull(), { timeout: 3000 });

    // O que está no aparelho nunca voltou para o valor velho do servidor.
    expect(localStorage.getItem(key(1, 'carga'))).toBe('80');
    expect(row(1).carga.value).toBe('80');
    expect(row(2).carga.value).toBe('70');
  });

  it('sinal fraco (o navegador diz online, mas o servidor não responde): faixa com "Tentar agora" que envia', async () => {
    render(<App />);
    await waitFor(() => expect(h.fetchActivePlan).toHaveBeenCalled());

    h.backend.state.reachable = false; // navigator.onLine continua true
    await registerSet(1, '90', '10');
    await waitFor(() => expect(banner().textContent).toMatch(/pendente/));
    expect(banner().textContent).not.toContain('Sem conexão');
    expect(serverSet(1)).toBeUndefined();

    h.backend.state.reachable = true;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Tentar agora' })); });
    await waitFor(() => expect(serverSet(1)).toMatchObject({ carga: 90, reps: 10, completed: true }));
    await waitFor(() => expect(banner()).toBeNull());
    expect(pendingQueue()).toEqual([]);
  });

  it('recorde offline: só chama de recorde o que supera a marca guardada', async () => {
    render(<App />);
    await waitFor(() => expect(h.fetchActivePlan).toHaveBeenCalled());
    await registerSet(1, '100', '8');
    await waitFor(() => expect(serverSet(1)).toBeDefined());

    h.backend.state.reachable = false;
    act(() => setNetwork(false));
    h.toast.mockClear();
    await registerSet(2, '90', '8'); // mais leve que os 100 kg guardados
    await waitFor(() => expect(banner()).not.toBeNull());
    expect(h.toast).not.toHaveBeenCalledWith(expect.stringContaining('Novo recorde'));
  });
});
