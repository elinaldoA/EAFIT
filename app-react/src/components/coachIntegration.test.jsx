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
vi.mock('../data/treinoData', async orig => ({ ...(await orig()), todayName: () => 'Segunda' }));
vi.mock('../hooks/useWakeLock', () => ({ useWakeLock: () => {} }));
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../context/useToast', () => ({ useToast: () => () => {} }));
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
    expect(h.coachSay).toHaveBeenNthCalledWith(1, 'start', { foco: 'Peito', dia: 'Segunda' });
    expect(h.coachSay).toHaveBeenNthCalledWith(2, 'exercise', { exercicio: 'Supino Reto', detalhe: '3 séries de 8 a 10' }, { queue: true });
  });

  it('treino de outro dia da semana não é chamado de "hoje"', () => {
    const outro = { ...DAY, dia: 'Domingo' };
    render(<LiveWorkoutModal day={outro} timer={timer} renderExercise={() => null} onFinish={vi.fn()} onClose={vi.fn()} />);
    expect(h.coachSay).toHaveBeenNthCalledWith(1, 'startOther', { foco: 'Peito', dia: 'Domingo' });
  });

  it('treino já concluído abre como revisão, não como convite para treinar', () => {
    localStorage.setItem('treino_Segunda', 'true');
    setup();
    expect(h.coachSay).toHaveBeenNthCalledWith(1, 'review', { foco: 'Peito', dia: 'Segunda' });
  });

  it('treino cujo cronômetro já terminou também abre como revisão', () => {
    render(<LiveWorkoutModal day={DAY} timer={{ ...timer, status: 'finished' }} renderExercise={() => null} onFinish={vi.fn()} onClose={vi.fn()} />);
    expect(h.coachSay).toHaveBeenNthCalledWith(1, 'review', { foco: 'Peito', dia: 'Segunda' });
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
    expect(h.coachStop).toHaveBeenCalledWith({ keep: ['finish', 'finishStats', 'weekGoal'] });
  });
});

describe('treinador comenta o andamento do treino', () => {
  const markDone = (nome, ...sets) => sets.forEach(n => localStorage.setItem(`set_${nome}_${n}_done`, 'true'));
  // O SetRow grava o check antes de avisar o descanso; o stub faz o mesmo.
  function setupMarking(props = {}) {
    const next = {};
    const renderExercise = (ex, onRestStart) => (
      <button
        type="button"
        onClick={() => {
          next[ex.nome] = (next[ex.nome] || 0) + 1;
          markDone(ex.nome, next[ex.nome]);
          onRestStart(ex.nome, 90);
        }}
      >marcar {ex.nome}</button>
    );
    return render(<LiveWorkoutModal day={DAY} timer={timer} renderExercise={renderExercise} onFinish={vi.fn()} onClose={vi.fn()} {...props} />);
  }
  const mark = nome => fireEvent.click(screen.getByRole('button', { name: `marcar ${nome}` }));

  it('na abertura, comenta o primeiro treino da semana e o que fecha a meta', () => {
    setupMarking({ week: { done: 0, total: 5 } });
    expect(h.coachSay).toHaveBeenNthCalledWith(2, 'weekFirst', {}, { queue: true });
    expect(h.coachSay).toHaveBeenNthCalledWith(3, 'exercise', expect.anything(), { queue: true });
    cleanup();
    h.coachSay.mockClear();
    setupMarking({ week: { done: 4, total: 5 } });
    expect(h.coachSay).toHaveBeenNthCalledWith(2, 'weekLast', {}, { queue: true });
  });

  it('treino já concluído não ganha comentário da semana', () => {
    localStorage.setItem('treino_Segunda', 'true');
    setupMarking({ week: { done: 0, total: 5 } });
    expect(h.coachSay).not.toHaveBeenCalledWith('weekFirst', expect.anything(), expect.anything());
  });

  it('avisa a última série, o exercício fechado (com o próximo) e a metade do treino', () => {
    setupMarking();
    h.coachSay.mockClear();
    mark('Supino Reto');
    expect(h.coachSay).toHaveBeenLastCalledWith('rest', { tempo: '1 minuto e 30 segundos' });
    mark('Supino Reto');
    expect(h.coachSay).toHaveBeenLastCalledWith('lastSet', { tempo: '1 minuto e 30 segundos' });
    mark('Supino Reto');
    expect(h.coachSay).toHaveBeenLastCalledWith('exerciseDone', { tempo: '1 minuto e 30 segundos', proximo: 'Crucifixo' });
    fireEvent.click(screen.getByRole('button', { name: /Próximo/ }));
    mark('Crucifixo');
    expect(h.coachSay).toHaveBeenLastCalledWith('halfway', { tempo: '1 minuto e 30 segundos' });
    mark('Crucifixo');
    expect(h.coachSay).toHaveBeenLastCalledWith('lastSet', { tempo: '1 minuto e 30 segundos' });
  });

  it('quem reabre o treino além da metade não ouve "metade" de novo', () => {
    markDone('Supino Reto', 1, 2, 3);
    markDone('Crucifixo', 1);
    setupMarking();
    localStorage.removeItem('set_Crucifixo_1_done');
    mark('Crucifixo');
    expect(h.coachSay).not.toHaveBeenCalledWith('halfway', expect.anything());
  });

  it('na última série do treino manda finalizar e não anuncia "próxima"', () => {
    vi.useFakeTimers();
    markDone('Supino Reto', 1, 2, 3);
    markDone('Crucifixo', 1, 2);
    setupMarking(); // já abre no Crucifixo, o primeiro pendente
    markDone('Crucifixo', 3);
    mark('Crucifixo');
    expect(h.coachSay).toHaveBeenLastCalledWith('allDone', { tempo: '1 minuto e 30 segundos' });
    h.coachSay.mockClear();
    act(() => { vi.advanceTimersByTime(91_000); });
    expect(h.coachSay).not.toHaveBeenCalledWith('rest10');
    expect(h.coachSay).not.toHaveBeenCalledWith('restDone', expect.anything(), expect.anything());
  });

  it('fala a pausa e a retomada do cronômetro', () => {
    const view = setupMarking();
    h.coachSay.mockClear();
    const rerender = status => view.rerender(
      <LiveWorkoutModal day={DAY} timer={{ ...timer, status }} renderExercise={() => null} onFinish={vi.fn()} onClose={vi.fn()} />,
    );
    rerender('paused');
    expect(h.coachSay).toHaveBeenLastCalledWith('paused');
    rerender('running');
    expect(h.coachSay).toHaveBeenLastCalledWith('resumed');
  });

  it('treino parado: chama de volta uma vez, e de novo só depois de alguma atividade', () => {
    vi.useFakeTimers();
    setupMarking();
    h.coachSay.mockClear();
    act(() => { vi.advanceTimersByTime(2 * 60_000); });
    expect(h.coachSay).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(6 * 60_000); });
    expect(h.coachSay).toHaveBeenCalledTimes(1);
    expect(h.coachSay).toHaveBeenCalledWith('idle', { exercicio: 'Supino Reto' });
    fireEvent.click(screen.getByRole('button', { name: /Próximo/ }));
    h.coachSay.mockClear();
    act(() => { vi.advanceTimersByTime(4 * 60_000); });
    expect(h.coachSay).toHaveBeenCalledWith('idle', { exercicio: 'Crucifixo' });
  });

  it('não chama de volta com o treino pausado nem durante o descanso', () => {
    vi.useFakeTimers();
    const view = setupMarking();
    view.rerender(<LiveWorkoutModal day={DAY} timer={{ ...timer, status: 'paused' }} renderExercise={() => null} onFinish={vi.fn()} onClose={vi.fn()} />);
    h.coachSay.mockClear();
    act(() => { vi.advanceTimersByTime(10 * 60_000); });
    expect(h.coachSay).not.toHaveBeenCalledWith('idle', expect.anything());
  });
});
