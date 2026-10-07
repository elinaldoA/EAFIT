// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

const { playSound } = vi.hoisted(() => ({ playSound: vi.fn() }));

vi.mock('../lib/sound', () => ({ playRestDoneSound: playSound }));
vi.mock('../hooks/useWakeLock', () => ({ useWakeLock: () => {} }));
vi.mock('../hooks/useBackToClose', () => ({ useBackToClose: () => {} }));
vi.mock('./ExerciseDemo', () => ({ default: () => null }));

import LiveWorkoutModal from './LiveWorkoutModal';

const DAY = {
  dia: 'Segunda',
  foco: 'Peito',
  exercicios: [
    { nome: 'Supino Reto', series: '2', reps: '8-10', descanso: '60s', tecnica: 'Controle' },
    { nome: 'Crucifixo', series: '3', reps: '12', descanso: '45s', tecnica: '' },
  ],
  pos: [{ nome: 'Prancha', series: '3', reps: '30s', descanso: '30s', tecnica: '' }],
};

const timer = (status = 'running', extra = {}) => ({ status, elapsedMs: 65000, pause: vi.fn(), resume: vi.fn(), ...extra });

function setup(props = {}) {
  const onFinish = vi.fn();
  const onClose = vi.fn();
  // renderExercise recebe o gancho que inicia o descanso (como o ExerciseBlock real)
  const renderExercise = vi.fn((ex, onRestStart) => (
    <button type="button" onClick={() => onRestStart(`Descanso ${ex.nome}`, 30)}>marcar {ex.nome}</button>
  ));
  const utils = render(
    <LiveWorkoutModal day={DAY} timer={timer()} renderExercise={renderExercise} onFinish={onFinish} onClose={onClose} {...props} />
  );
  return { ...utils, onFinish, onClose, renderExercise };
}

const markDone = (nome, n) => localStorage.setItem(`set_${nome}_${n}_done`, 'true');

// jsdom não implementa scrollTo em elementos
Element.prototype.scrollTo = () => {};

beforeEach(() => {
  localStorage.clear();
  playSound.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('LiveWorkoutModal', () => {
  it('abre no primeiro exercício pendente', () => {
    markDone('Supino Reto', 1);
    markDone('Supino Reto', 2);
    setup();
    expect(screen.getByRole('heading', { name: 'Crucifixo' })).toBeTruthy();
    expect(screen.getByText('3 séries')).toBeTruthy();
    expect(screen.getByText('12 reps')).toBeTruthy();
  });

  it('com tudo pendente abre no primeiro e mostra a técnica', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Supino Reto' })).toBeTruthy();
    expect(screen.getByText(/Controle/)).toBeTruthy();
  });

  it('navega com Próximo e Anterior; Anterior fica desabilitado no primeiro', () => {
    setup();
    const prev = screen.getByRole('button', { name: 'Exercício anterior' });
    expect(prev.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Próximo/ }));
    expect(screen.getByRole('heading', { name: 'Crucifixo' })).toBeTruthy();
    expect(prev.disabled).toBe(false);
    fireEvent.click(prev);
    expect(screen.getByRole('heading', { name: 'Supino Reto' })).toBeTruthy();
  });

  it('as bolinhas pulam direto para um exercício', () => {
    setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Prancha' }));
    expect(screen.getByRole('heading', { name: 'Prancha' })).toBeTruthy();
    expect(screen.getByText(/Pós-treino/)).toBeTruthy();
  });

  it('no último exercício o botão vira Finalizar treino e chama onFinish', () => {
    const { onFinish } = setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Prancha' }));
    fireEvent.click(screen.getByRole('button', { name: /Finalizar treino/ }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('depois de finalizado o último botão vira Ver resumo', () => {
    setup({ timer: timer('finished') });
    fireEvent.click(screen.getByRole('tab', { name: 'Prancha' }));
    expect(screen.getByRole('button', { name: /Ver resumo/ })).toBeTruthy();
  });

  it('Finalizar no topo só aparece fora do último exercício', () => {
    const { onFinish } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('tab', { name: 'Prancha' }));
    expect(screen.queryByRole('button', { name: 'Finalizar' })).toBeNull();
  });

  it('✕ chama onClose', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Sair do modo treino' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('mostra o progresso de séries e o aviso de exercício concluído com o próximo', () => {
    markDone('Supino Reto', 1);
    markDone('Supino Reto', 2);
    setup();
    fireEvent.click(screen.getByRole('tab', { name: 'Supino Reto' }));
    expect(screen.getByRole('status').textContent).toMatch(/Exercício concluído/);
    expect(screen.getByRole('status').textContent).toMatch(/Crucifixo/);
    expect(screen.getByLabelText('2 de 8 séries concluídas')).toBeTruthy();
  });

  it('o relógio, a pausa e o continuar usam o timer do treino', () => {
    const t = timer('running');
    const { rerender, renderExercise, onFinish, onClose } = setup({ timer: t });
    expect(screen.getByLabelText('Tempo de treino').textContent).toBe('01:05');
    fireEvent.click(screen.getByRole('button', { name: 'Pausar treino' }));
    expect(t.pause).toHaveBeenCalled();

    const paused = timer('paused');
    rerender(<LiveWorkoutModal day={DAY} timer={paused} renderExercise={renderExercise} onFinish={onFinish} onClose={onClose} />);
    expect(screen.getByText('⏸ Treino pausado')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '▶ Continuar' }));
    expect(paused.resume).toHaveBeenCalled();
  });

  it('exercício sem séries mostra o aviso em vez do bloco de registro', () => {
    setup({ day: { ...DAY, exercicios: [{ nome: 'Alongar', series: '-', reps: '5min', descanso: '-', tecnica: '' }], pos: [] } });
    expect(screen.getByText(/Sem séries pra registrar/)).toBeTruthy();
  });
});

describe('LiveWorkoutModal — descanso', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('o descanso começa ao marcar a série, conta, aceita +15s e pular', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'marcar Supino Reto' }));
    expect(screen.getByRole('timer').textContent).toMatch(/00:30/);

    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByRole('timer').textContent).toMatch(/00:20/);

    fireEvent.click(screen.getByRole('button', { name: '+15s' }));
    expect(screen.getByRole('timer').textContent).toMatch(/00:35/);

    fireEvent.click(screen.getByRole('button', { name: 'Pular' }));
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('ao zerar toca o alarme, avisa e some sozinho', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'marcar Supino Reto' }));
    act(() => { vi.advanceTimersByTime(30_500); });
    expect(playSound).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('timer').textContent).toMatch(/Descanso concluído/);

    act(() => { vi.advanceTimersByTime(1_600); });
    expect(screen.queryByRole('timer')).toBeNull();
  });
});
