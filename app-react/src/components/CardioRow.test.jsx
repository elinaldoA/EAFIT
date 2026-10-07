// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

const h = vi.hoisted(() => ({ user: { id: 'u1' }, saveSetState: vi.fn() }));

vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('../context/useWorkout', () => ({ useWorkout: () => ({ saveSetState: h.saveSetState }) }));

import CardioRow from './CardioRow';

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
  h.saveSetState.mockReset();
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
