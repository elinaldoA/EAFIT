// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  user: { id: 'u1', user_metadata: {} },
  saveSetState: vi.fn(),
  beep: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('../context/useWorkout', () => ({ useWorkout: () => ({ saveSetState: h.saveSetState, workoutIds: { Segunda: 'w-seg' } }) }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../lib/sound', () => ({ playRestDoneSound: (...a) => h.beep(...a) }));

import TimedSetRow from './TimedSetRow';

const EX = { nome: 'Prancha Frontal Estática', series: '3', reps: '40s', descanso: '30s' };
const DAY = { dia: 'Segunda' };

function setup(props = {}) {
  const bump = vi.fn();
  const onRestStart = vi.fn();
  render(<TimedSetRow ex={EX} n={1} day={DAY} bump={bump} onRestStart={onRestStart} started {...props} />);
  return { bump, onRestStart };
}

const seg = () => screen.getByPlaceholderText('seg');
const check = () => screen.getByRole('button', { name: '✓' });

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  h.user = { id: 'u1', user_metadata: {} };
  h.saveSetState.mockReset().mockResolvedValue('w-id');
  h.beep.mockReset();
  h.toast.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('TimedSetRow', () => {
  it('começa com a duração e o check que já estavam salvos', () => {
    localStorage.setItem('set_Prancha Frontal Estática_1_duracao_s', '42');
    localStorage.setItem('set_Prancha Frontal Estática_1_done', 'true');
    setup();
    expect(seg().value).toBe('42');
    expect(check().getAttribute('aria-pressed')).toBe('true');
  });

  it('digitar a duração salva em duracao_s (e não em reps) depois da pausa', () => {
    const { bump } = setup();
    fireEvent.change(seg(), { target: { value: '45' } });
    expect(bump).toHaveBeenCalled();
    expect(h.saveSetState).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(800); });
    expect(h.saveSetState).toHaveBeenCalledWith('Segunda', 'Prancha Frontal Estática', 1, { duracao_s: 45 });
  });

  it('kg é opcional e salva só a carga', () => {
    setup();
    const kg = screen.getByPlaceholderText('kg');
    fireEvent.change(kg, { target: { value: '10,5' } });
    fireEvent.blur(kg);
    expect(h.saveSetState).toHaveBeenCalledWith('Segunda', 'Prancha Frontal Estática', 1, { carga: 10.5 });
  });

  it('o cronômetro preenche a duração ao parar e apita ao chegar na meta', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '⏱ Cronometrar' }));
    act(() => { vi.advanceTimersByTime(41000); });
    expect(h.beep).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '⏹ Parar' }));
    expect(seg().value).toBe('41');
    expect(localStorage.getItem('set_Prancha Frontal Estática_1_duracao_s')).toBe('41');
    expect(h.saveSetState).toHaveBeenCalledWith('Segunda', 'Prancha Frontal Estática', 1, { duracao_s: 41 });
  });

  it('o check marca a série e abre o descanso do exercício', () => {
    const { onRestStart } = setup();
    fireEvent.click(check());
    expect(localStorage.getItem('set_Prancha Frontal Estática_1_done')).toBe('true');
    expect(h.saveSetState).toHaveBeenCalledWith('Segunda', 'Prancha Frontal Estática', 1, { completed: true });
    expect(onRestStart).toHaveBeenCalledWith('Prancha Frontal Estática', 30);
  });

  it('sem treino iniciado os campos ficam bloqueados', () => {
    setup({ started: false });
    expect(seg().disabled).toBe(true);
    expect(check().disabled).toBe(true);
  });
});
