// @vitest-environment jsdom
// O treinador por voz plugado no modo treino ao vivo: o que ele diz e quando.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

const h = vi.hoisted(() => ({ coachSay: vi.fn(), coachStop: vi.fn() }));

vi.mock('../lib/sound', () => ({ playRestDoneSound: vi.fn() }));
vi.mock('../lib/coach', async orig => ({
  ...(await orig()),
  coachSay: (...a) => h.coachSay(...a),
  coachStop: (...a) => h.coachStop(...a),
}));
vi.mock('../hooks/useWakeLock', () => ({ useWakeLock: () => {} }));
vi.mock('../hooks/useBackToClose', () => ({ useBackToClose: () => {} }));
vi.mock('./ExerciseDemo', () => ({ default: () => null }));

import LiveWorkoutModal from './LiveWorkoutModal';

const DAY = {
  dia: 'Segunda',
  foco: '💪 Peito',
  exercicios: [
    { nome: 'Supino Reto', series: '3', reps: '8-10', descanso: '60s', tecnica: '' },
    { nome: 'Crucifixo', series: '3', reps: '12', descanso: '45s', tecnica: '' },
  ],
  pos: [],
};
const timer = { status: 'running', elapsedMs: 1000, pause: vi.fn(), resume: vi.fn() };

function setup() {
  const renderExercise = (ex, onRestStart) => (
    <button type="button" onClick={() => onRestStart(ex.nome, 90)}>marcar {ex.nome}</button>
  );
  return render(<LiveWorkoutModal day={DAY} timer={timer} renderExercise={renderExercise} onFinish={vi.fn()} onClose={vi.fn()} />);
}

Element.prototype.scrollTo = () => {};

beforeEach(() => {
  localStorage.clear();
  h.coachSay.mockClear();
  h.coachStop.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('treinador por voz no modo treino', () => {
  it('abre falando o dia e apresenta o primeiro exercício na fila', () => {
    setup();
    expect(h.coachSay).toHaveBeenNthCalledWith(1, 'start', { foco: 'Peito' });
    expect(h.coachSay).toHaveBeenNthCalledWith(2, 'exercise', { exercicio: 'Supino Reto', detalhe: '3 séries de 8 a 10' }, { queue: true });
  });

  it('ao trocar de exercício, apresenta o novo (sem fila)', () => {
    setup();
    h.coachSay.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Próximo/ }));
    expect(h.coachSay).toHaveBeenCalledWith('exercise', { exercicio: 'Crucifixo', detalhe: '3 séries de 12' }, { queue: false });
    expect(h.coachSay).not.toHaveBeenCalledWith('start', expect.anything());
  });

  it('ao iniciar o descanso, diz quanto tempo é', () => {
    setup();
    h.coachSay.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'marcar Supino Reto' }));
    expect(h.coachSay).toHaveBeenCalledWith('rest', { tempo: '1 minuto e 30 segundos' });
  });

  it('avisa aos 10 segundos e, no fim, fala depois do alarme', () => {
    vi.useFakeTimers();
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'marcar Supino Reto' }));
    h.coachSay.mockClear();
    act(() => { vi.advanceTimersByTime(80_000); });
    expect(h.coachSay).toHaveBeenCalledWith('rest10');
    act(() => { vi.advanceTimersByTime(10_500); });
    expect(h.coachSay).toHaveBeenCalledWith('restDone', {}, { delayMs: 3900 });
  });

  it('ao sair, para a fala mas mantém a de fim de treino', () => {
    const { unmount } = setup();
    unmount();
    expect(h.coachStop).toHaveBeenCalledWith({ keep: ['finish'] });
  });
});
