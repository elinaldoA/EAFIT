// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

const h = vi.hoisted(() => ({ user: { id: 'u1' }, saveSetState: vi.fn(), toast: vi.fn(), cue: vi.fn(), checkRunPR: vi.fn() }));

vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('../context/useWorkout', () => ({ useWorkout: () => ({ saveSetState: h.saveSetState, workoutIds: { Segunda: 'w-seg' } }) }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../lib/sound', () => ({ playRunCue: (...a) => h.cue(...a) }));
vi.mock('../lib/runStats', async importOriginal => ({ ...(await importOriginal()), checkForRunPR: (...a) => h.checkRunPR(...a) }));

import CardioRow from './CardioRow';
import { readSession, endSession, setGps, notifyDistance } from '../lib/runSession';

const EX = { nome: '🏃 Cardio — Esteira', series: '-', reps: '20min · Moderado', descanso: '-' };
const DAY = { dia: 'Segunda' };

function setup(props = {}) {
  const bump = vi.fn();
  render(<CardioRow ex={EX} day={DAY} bump={bump} started {...props} />);
  return { bump };
}

const duracao = () => screen.getByLabelText('Duração (min)');
const distancia = () => screen.getByLabelText('Distância (km)');
const check = () => screen.getByRole('button', { name: 'Cardio concluído' });

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
  h.user = { id: 'u1' };
  h.saveSetState.mockReset().mockResolvedValue('w-id');
  h.toast.mockReset();
  h.cue.mockReset();
  h.checkRunPR.mockReset().mockResolvedValue(null);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('CardioRow', () => {
  it('usa os minutos planejados como dica do campo de duração', () => {
    setup();
    expect(duracao().placeholder).toBe('20');
  });

  it('digitar duração e distância guarda local e salva no banco depois da pausa', () => {
    const { bump } = setup();
    fireEvent.change(duracao(), { target: { value: '30' } });
    fireEvent.change(distancia(), { target: { value: '5,2' } });
    expect(localStorage.getItem('set_🏃 Cardio — Esteira_1_duracao')).toBe('30');
    expect(bump).toHaveBeenCalled();
    expect(h.saveSetState).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(800); });
    expect(h.saveSetState).toHaveBeenCalledWith('Segunda', EX.nome, 1, { duracao_min: 30 });
    expect(h.saveSetState).toHaveBeenCalledWith('Segunda', EX.nome, 1, { distancia_km: 5.2 });
  });

  it('sair do campo salva na hora; valor inválido vira null', () => {
    setup();
    fireEvent.change(duracao(), { target: { value: 'abc' } });
    fireEvent.blur(duracao());
    expect(h.saveSetState).toHaveBeenCalledWith('Segunda', EX.nome, 1, { duracao_min: null });
  });

  it('mostra o ritmo médio quando há duração e distância', () => {
    setup();
    expect(screen.queryByText(/Ritmo médio/)).toBeNull();
    fireEvent.change(duracao(), { target: { value: '30' } });
    fireEvent.change(distancia(), { target: { value: '5' } });
    expect(screen.getByText(/Ritmo médio/).textContent).toContain('6:00');
  });

  it('cronômetro: iniciar, pausar, continuar e parar preenchendo a duração', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '▶ Iniciar' }));
    act(() => { vi.advanceTimersByTime(90_000); });
    expect(screen.getByLabelText('Cronômetro do cardio').textContent).toBe('01:30');

    fireEvent.click(screen.getByRole('button', { name: '⏸ Pausar' }));
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(screen.getByLabelText('Cronômetro do cardio').textContent).toBe('01:30');

    fireEvent.click(screen.getByRole('button', { name: '▶ Continuar' }));
    act(() => { vi.advanceTimersByTime(30_000); });
    fireEvent.click(screen.getByRole('button', { name: '⏹ Parar' }));

    // 2 min no total
    expect(duracao().value).toBe('2');
    expect(h.saveSetState).toHaveBeenCalledWith('Segunda', EX.nome, 1, { duracao_min: 2 });
    expect(screen.getByLabelText('Cronômetro do cardio').textContent).toBe('00:00');
    expect(screen.queryByRole('button', { name: '⏹ Parar' })).toBeNull();
  });

  it('o cronômetro sobrevive a remontar o componente (guardado no aparelho)', () => {
    const first = render(<CardioRow ex={EX} day={DAY} bump={vi.fn()} started />);
    fireEvent.click(screen.getByRole('button', { name: '▶ Iniciar' }));
    act(() => { vi.advanceTimersByTime(60_000); });
    first.unmount();

    render(<CardioRow ex={EX} day={DAY} bump={vi.fn()} started />);
    expect(screen.getByRole('button', { name: '⏸ Pausar' })).toBeTruthy();
    expect(screen.getByLabelText('Cronômetro do cardio').textContent).toBe('01:00');
  });

  it('parar com menos de 1s não preenche a duração', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '▶ Iniciar' }));
    fireEvent.click(screen.getByRole('button', { name: '⏹ Parar' }));
    expect(duracao().value).toBe('');
    expect(h.saveSetState).not.toHaveBeenCalled();
  });

  it('concluir com o cronômetro correndo para ele, grava a duração e marca completed', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '▶ Iniciar' }));
    act(() => { vi.advanceTimersByTime(120_000); });
    fireEvent.click(check());
    expect(duracao().value).toBe('2');
    expect(check().getAttribute('aria-pressed')).toBe('true');
    expect(h.saveSetState).toHaveBeenCalledWith('Segunda', EX.nome, 1, { completed: true });
  });

  it('desmarcar volta completed:false', () => {
    localStorage.setItem('set_🏃 Cardio — Esteira_1_done', 'true');
    setup();
    fireEvent.click(check());
    expect(h.saveSetState).toHaveBeenCalledWith('Segunda', EX.nome, 1, { completed: false });
  });

  it('treino não iniciado trava tudo', () => {
    setup({ started: false });
    expect(duracao().disabled).toBe(true);
    expect(distancia().disabled).toBe(true);
    expect(check().disabled).toBe(true);
    expect(screen.getByRole('button', { name: '▶ Iniciar' }).disabled).toBe(true);
  });

  it('sem usuário não chama o banco', () => {
    h.user = null;
    setup();
    fireEvent.change(duracao(), { target: { value: '10' } });
    fireEvent.blur(duracao());
    expect(h.saveSetState).not.toHaveBeenCalled();
    expect(localStorage.getItem('set_🏃 Cardio — Esteira_1_duracao')).toBe('10');
  });
});

describe('CardioRow — corrida', () => {
  const RUN = { nome: 'Caminhada e Corrida Alternadas', series: '-', reps: '9min · 2min corre / 1min caminha', descanso: '-' };
  const start = () => fireEvent.click(screen.getByRole('button', { name: '▶ Iniciar' }));
  const advance = ms => act(() => { vi.advanceTimersByTime(ms); });

  it('corre/caminha: mostra a fase e apita só nas trocas (não ao iniciar)', () => {
    setup({ ex: RUN });
    start();
    expect(screen.getByRole('status').textContent).toContain('🏃 Corra');
    expect(h.cue).not.toHaveBeenCalled();
    advance(121000);
    expect(screen.getByRole('status').textContent).toContain('🚶 Caminhe');
    expect(h.cue).toHaveBeenCalledTimes(1);
    expect(h.cue).toHaveBeenLastCalledWith('walk');
    advance(60000);
    expect(screen.getByRole('status').textContent).toContain('🏃 Corra');
    expect(h.cue).toHaveBeenLastCalledWith('run');
  });

  it('item sem corre/caminha não mostra fase', () => {
    setup({ ex: { nome: 'Corrida Leve (Trote)', series: '-', reps: '30min · ritmo leve', descanso: '-' } });
    start();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('concluir uma corrida com distância confere o recorde e avisa', async () => {
    h.checkRunPR.mockResolvedValue([{ kind: 'distance', value: 6 }, { kind: 'pace', value: 300 }]);
    localStorage.setItem('set_Corrida Leve (Trote)_1_duracao', '30');
    localStorage.setItem('set_Corrida Leve (Trote)_1_distancia', '6');
    setup({ ex: { nome: 'Corrida Leve (Trote)', series: '-', reps: '30min · ritmo leve', descanso: '-' } });
    await act(async () => { fireEvent.click(check()); });
    expect(h.checkRunPR).toHaveBeenCalledWith('u1', { minutes: '30', km: '6' }, { workoutId: 'w-id', setNumber: 1 });
    expect(h.toast).toHaveBeenCalledWith('🏆 Novo recorde de corrida — maior distância: 6 km · melhor ritmo: 5:00/km!');
  });

  it('cardio que não é corrida não confere recorde de corrida', async () => {
    setup();
    await act(async () => { fireEvent.click(check()); });
    expect(h.checkRunPR).not.toHaveBeenCalled();
  });
});

describe('CardioRow — sessão de corrida e GPS', () => {
  const RUN = { nome: 'Corrida Leve (Trote)', series: '-', reps: '30min · ritmo leve', descanso: '-' };
  const geo = { watchPosition: vi.fn(), clearWatch: vi.fn() };
  const gpsBtn = name => screen.getByRole('button', { name });
  const start = () => fireEvent.click(screen.getByRole('button', { name: '▶ Iniciar' }));

  beforeEach(() => {
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
    endSession();
  });
  afterEach(() => { cleanup(); delete navigator.geolocation; endSession(); });

  it('só oferece o GPS em corrida (não no cardio de esteira) e com suporte do navegador', () => {
    setup();
    expect(screen.queryByRole('button', { name: /GPS/ })).toBeNull();
    cleanup();
    delete navigator.geolocation;
    setup({ ex: RUN });
    expect(screen.queryByRole('button', { name: /GPS/ })).toBeNull();
  });

  it('ligar o GPS guarda a preferência e explica o uso, sem iniciar sessão', () => {
    setup({ ex: RUN });
    fireEvent.click(gpsBtn('📍 Usar GPS'));
    expect(localStorage.getItem('cardio_gps_on')).toBe('true');
    expect(gpsBtn('📍 GPS ligado').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/Mantenha a tela ligada e o app aberto/)).toBeTruthy();
    expect(readSession()).toBeNull();
  });

  it('iniciar registra a sessão (com a preferência de GPS); pausar mantém e para; parar encerra', () => {
    localStorage.setItem('cardio_gps_on', 'true');
    setup({ ex: RUN });
    start();
    expect(readSession()).toMatchObject({ nome: 'Corrida Leve (Trote)', dia: 'Segunda', running: true, gps: true });
    act(() => { vi.advanceTimersByTime(3000); });
    fireEvent.click(screen.getByRole('button', { name: '⏸ Pausar' }));
    expect(readSession()).toMatchObject({ running: false });
    fireEvent.click(screen.getByRole('button', { name: '▶ Continuar' }));
    expect(readSession().running).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '⏹ Parar' }));
    expect(readSession()).toBeNull();
  });

  it('sem GPS ligado a sessão ainda existe (tela acesa e proteções), mas sem gps', () => {
    setup({ ex: RUN });
    start();
    expect(readSession()).toMatchObject({ running: true, gps: false });
  });

  it('cardio de esteira não abre sessão de corrida', () => {
    setup();
    start();
    expect(readSession()).toBeNull();
  });

  it('alternar o GPS no meio da corrida atualiza a sessão', () => {
    setup({ ex: RUN });
    start();
    fireEvent.click(gpsBtn('📍 Usar GPS'));
    expect(readSession().gps).toBe(true);
  });

  it('reabrir com o cronômetro correndo (F5) retoma a sessão', () => {
    localStorage.setItem('cardio_timer_Corrida Leve (Trote)', JSON.stringify({ accumulatedMs: 0, runningSince: Date.now() - 60000 }));
    localStorage.setItem('cardio_gps_on', 'true');
    setup({ ex: RUN });
    expect(readSession()).toMatchObject({ nome: 'Corrida Leve (Trote)', running: true, gps: true });
  });

  it('mostra o estado do GPS publicado pelo host e relê a distância que ele grava', () => {
    localStorage.setItem('cardio_gps_on', 'true');
    setup({ ex: RUN });
    start();
    act(() => setGps({ status: 'searching', accuracy: null }));
    expect(screen.getByText('Buscando sinal de GPS…')).toBeTruthy();
    act(() => setGps({ status: 'tracking', accuracy: 7 }));
    expect(screen.getByText('GPS ativo · precisão ±7 m')).toBeTruthy();
    act(() => { localStorage.setItem('set_Corrida Leve (Trote)_1_distancia', '1.25'); notifyDistance(); });
    expect(distancia().value).toBe('1.25');
    act(() => setGps({ status: 'denied', accuracy: null }));
    expect(screen.getByText(/Localização negada no navegador/)).toBeTruthy();
    expect(distancia().disabled).toBe(false);
  });
});
