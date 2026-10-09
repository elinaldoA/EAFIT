// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  user: { id: 'u1' },
  workout: {},
  toast: vi.fn(),
  postActivity: vi.fn(),
  finishedSound: vi.fn(),
  coachSay: vi.fn(),
}));

vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('../context/useWorkout', () => ({ useWorkout: () => h.workout }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../lib/friends', () => ({ postActivity: (...a) => h.postActivity(...a) }));
vi.mock('../lib/coach', async orig => ({ ...(await orig()), coachSay: (...a) => h.coachSay(...a) }));
vi.mock('../lib/sound', () => ({ playWorkoutFinishedSound: h.finishedSound }));
// O bloco de exercício e o modo ao vivo têm testes próprios: aqui viram stubs
// que expõem os callbacks que o cartão entrega a eles.
vi.mock('./ExerciseBlock', () => ({
  default: ({ ex, started, open, version, onToggleAll, onFillOthers, onApplySuggestion }) => (
    <div data-testid={`ex-${ex.nome}`} data-started={String(started)} data-open={String(open)} data-version={version}>
      <button type="button" onClick={onToggleAll}>todas {ex.nome}</button>
      <button type="button" onClick={() => onFillOthers('80', '10')}>preencher {ex.nome}</button>
      <button type="button" onClick={() => onApplySuggestion('85', 9)}>sugestao {ex.nome}</button>
      <button type="button" onClick={() => onApplySuggestion('70', null)}>deload {ex.nome}</button>
    </div>
  ),
}));
vi.mock('./LiveWorkoutModal', () => ({
  default: ({ onFinish, onClose }) => (
    <div role="dialog" aria-label="ao vivo">
      <button type="button" onClick={onFinish}>fim ao vivo</button>
      <button type="button" onClick={onClose}>fechar ao vivo</button>
    </div>
  ),
}));

import DayCard from './WorkoutDayCard';

const DAY = {
  dia: 'Segunda',
  foco: 'Peito',
  exercicios: [
    { nome: 'Supino', series: '3', reps: '8-10', descanso: '60s', tecnica: '' },
    { nome: 'Crucifixo', series: '2', reps: '12', descanso: '45s', tecnica: '' },
  ],
  pos: [{ nome: 'Prancha', series: '2', reps: '30s', descanso: '30s', tecnica: '' }],
};

function setup(props = {}) {
  const fns = { bump: vi.fn(), onRestStart: vi.fn(), onFinish: vi.fn(), onOpenLive: vi.fn(), onCloseLive: vi.fn() };
  const view = render(<DayCard day={DAY} isToday {...fns} {...props} />);
  return { ...fns, ...view };
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
  h.user = { id: 'u1' };
  h.toast.mockReset();
  h.postActivity.mockReset();
  h.finishedSound.mockReset();
  h.coachSay.mockReset();
  h.workout = {
    activePlanDays: [DAY, { dia: 'Terça' }, { dia: 'Sábado' }, { dia: 'Domingo' }],
    saveWorkoutStatus: vi.fn().mockResolvedValue(undefined),
    saveSetState: vi.fn().mockResolvedValue(undefined),
    saveWorkoutTimer: vi.fn().mockResolvedValue(undefined),
    saveWorkoutNotes: vi.fn().mockResolvedValue(undefined),
  };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('DayCard — cabeçalho', () => {
  it('mostra dia, foco, badge de hoje e a contagem de exercícios', () => {
    setup();
    expect(screen.getByText('Segunda')).toBeTruthy();
    expect(screen.getByText('Peito')).toBeTruthy();
    expect(screen.getByText('Hoje')).toBeTruthy();
    expect(screen.getByText('2 exerc.')).toBeTruthy();
  });

  it('mostra séries feitas/total quando já há progresso', () => {
    localStorage.setItem('set_Supino_1_done', 'true');
    setup();
    expect(screen.getByText('1/7 séries')).toBeTruthy();
  });

  it('o cabeçalho abre e fecha o corpo; só o dia de hoje começa aberto', () => {
    setup({ isToday: false });
    const header = screen.getByRole('button', { expanded: false });
    expect(screen.getByTestId('ex-Supino').dataset.open).toBe('false');
    fireEvent.click(header);
    expect(screen.getByRole('button', { expanded: true })).toBeTruthy();
    expect(screen.getByTestId('ex-Supino').dataset.open).toBe('true');
  });

  it('o checkbox marca o treino, guarda e salva sem abrir/fechar o cartão', async () => {
    setup({ isToday: false });
    const box = screen.getByRole('checkbox', { name: /Marcar treino de Segunda/ });
    await act(async () => { fireEvent.click(box); });
    expect(localStorage.getItem('treino_Segunda')).toBe('true');
    expect(h.workout.saveWorkoutStatus).toHaveBeenCalledWith('Segunda', true);
    expect(h.toast).toHaveBeenCalledWith('✅ Treino marcado!');
    expect(screen.getByRole('button', { expanded: false })).toBeTruthy();
  });
});

describe('DayCard — cronômetro do treino', () => {
  it('sem iniciar, os exercícios ficam travados e há a dica', () => {
    setup();
    expect(screen.getByTestId('ex-Supino').dataset.started).toBe('false');
    expect(screen.getByText('Inicie o treino para registrar as séries')).toBeTruthy();
  });

  it('iniciar libera as séries e salva o início', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '▶ Iniciar' }));
    expect(screen.getByTestId('ex-Supino').dataset.started).toBe('true');
    expect(h.workout.saveWorkoutTimer).toHaveBeenCalledWith('Segunda', expect.objectContaining({ finishedAt: null, durationSeconds: null }));
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeTruthy();
  });

  it('pausar e continuar', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '▶ Iniciar' }));
    act(() => { vi.advanceTimersByTime(5000); });
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeTruthy();
  });

  it('finalizar: toca o som, marca o treino, salva a duração e abre o resumo', async () => {
    localStorage.setItem('set_Supino_1_done', 'true');
    localStorage.setItem('set_Supino_1_carga', '80');
    const { onFinish, bump } = setup();
    fireEvent.click(screen.getByRole('button', { name: '▶ Iniciar' }));
    act(() => { vi.advanceTimersByTime(60_000); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '🏁 Finalizar' })); });

    expect(h.finishedSound).toHaveBeenCalled();
    expect(h.coachSay).toHaveBeenCalledWith('finish', { feitos: 1, meta: 2 }, { delayMs: 900 });
    expect(h.coachSay).toHaveBeenCalledWith('finishStats', { series: 1, duracao: '1 minuto' }, { delayMs: 950, queue: true });
    expect(h.coachSay).not.toHaveBeenCalledWith('weekGoal', expect.anything(), expect.anything());
    expect(localStorage.getItem('treino_Segunda')).toBe('true');
    expect(h.workout.saveWorkoutTimer).toHaveBeenLastCalledWith('Segunda', expect.objectContaining({ durationSeconds: 60 }));
    expect(bump).toHaveBeenCalled();
    expect(h.postActivity).toHaveBeenCalledWith('treino', 'Concluiu o treino de Peito', expect.stringContaining('1 séries'));
    const summary = onFinish.mock.calls[0][0];
    expect(summary).toMatchObject({ durationMs: 60000, totalSetsDone: 1, totalPlannedSets: 7, totalCarga: 80 });
    expect(summary.weekTotal).toBe(2); // Segunda e Terça — fim de semana não conta
    expect(summary.weekDone).toBe(1);
    expect(screen.getByText(/concluído/)).toBeTruthy();
  });

  it('finalizar sem nenhuma série marcada não publica atividade para os amigos', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '▶ Iniciar' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '🏁 Finalizar' })); });
    expect(h.postActivity).not.toHaveBeenCalled();
  });

  it('depois de finalizado: Ver resumo reabre o resumo e Refazer zera o cronômetro', async () => {
    const { onFinish } = setup();
    fireEvent.click(screen.getByRole('button', { name: '▶ Iniciar' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '🏁 Finalizar' })); });
    onFinish.mockClear();

    fireEvent.click(screen.getByRole('button', { name: '📋 Ver resumo' }));
    expect(onFinish).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '↺ Refazer treino' }));
    expect(h.workout.saveWorkoutTimer).toHaveBeenLastCalledWith('Segunda', { startedAt: null, finishedAt: null, durationSeconds: null });
    expect(screen.getByRole('button', { name: '▶ Iniciar' })).toBeTruthy();
  });

  it('sem usuário o cronômetro funciona só local', () => {
    h.user = null;
    setup();
    fireEvent.click(screen.getByRole('button', { name: '▶ Iniciar' }));
    expect(h.workout.saveWorkoutTimer).not.toHaveBeenCalled();
    expect(screen.getByTestId('ex-Supino').dataset.started).toBe('true');
  });
});

describe('DayCard — séries', () => {
  it('Marcar todas liga todas as séries, avisa e salva uma a uma; de novo desmarca', async () => {
    const { bump } = setup();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'todas Supino' })); });
    for (const n of [1, 2, 3]) expect(localStorage.getItem(`set_Supino_${n}_done`)).toBe('true');
    expect(bump).toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith('✅ Todas as séries marcadas!');
    expect(h.workout.saveSetState).toHaveBeenCalledTimes(3);
    expect(h.workout.saveSetState).toHaveBeenCalledWith('Segunda', 'Supino', 2, { completed: true });
    // força o SetRow a reler o valor
    expect(screen.getByTestId('ex-Supino').dataset.version).toMatch(/^1-/);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'todas Supino' })); });
    expect(localStorage.getItem('set_Supino_1_done')).toBe('false');
    expect(h.toast).toHaveBeenCalledWith('Séries desmarcadas');
  });

  it('repetir carga/reps preenche só as séries vazias', async () => {
    localStorage.setItem('set_Supino_2_carga', '60');
    await act(async () => { setup(); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'preencher Supino' })); });
    expect(localStorage.getItem('set_Supino_2_carga')).toBe('60'); // já tinha: preservada
    expect(localStorage.getItem('set_Supino_3_carga')).toBe('80');
    expect(localStorage.getItem('set_Supino_3_reps')).toBe('10');
    expect(h.workout.saveSetState).toHaveBeenCalledTimes(1);
    expect(h.workout.saveSetState).toHaveBeenCalledWith('Segunda', 'Supino', 3, { carga: 80, reps: 10 });
    expect(h.toast).toHaveBeenCalledWith('✅ Carga e reps repetidas nas outras séries');
  });

  it('repetir não faz nada quando todas as outras séries já têm valor', async () => {
    localStorage.setItem('set_Crucifixo_2_carga', '20');
    setup();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'preencher Crucifixo' })); });
    expect(h.workout.saveSetState).not.toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled();
  });

  it('aplicar sugestão grava na série 1 e propaga às demais quando há reps', async () => {
    setup();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'sugestao Supino' })); });
    expect(localStorage.getItem('set_Supino_1_carga')).toBe('85');
    expect(localStorage.getItem('set_Supino_1_reps')).toBe('9');
    expect(h.workout.saveSetState).toHaveBeenCalledWith('Segunda', 'Supino', 1, { carga: 85, reps: 9 });
    expect(localStorage.getItem('set_Supino_2_carga')).toBe('85');
    expect(h.toast).toHaveBeenCalledWith('🎯 Sugestão aplicada na Série 1');
  });

  it('sugestão de deload (sem reps) só mexe na série 1', async () => {
    setup();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'deload Supino' })); });
    expect(localStorage.getItem('set_Supino_1_carga')).toBe('70');
    expect(localStorage.getItem('set_Supino_2_carga')).toBeNull();
    expect(h.workout.saveSetState).toHaveBeenCalledWith('Segunda', 'Supino', 1, { carga: 70 });
  });
});

describe('DayCard — notas e modo ao vivo', () => {
  it('notas: abre, guarda local na hora e salva no banco depois da pausa', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Notas do treino/ }));
    const box = screen.getByPlaceholderText(/Como foi o treino/);
    fireEvent.change(box, { target: { value: 'ombro estalando' } });
    expect(localStorage.getItem('treino_Segunda_notes')).toBe('ombro estalando');
    expect(h.workout.saveWorkoutNotes).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(800); });
    expect(h.workout.saveWorkoutNotes).toHaveBeenCalledWith('Segunda', 'ombro estalando');
  });

  it('notas: sair do campo salva na hora', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Notas do treino/ }));
    const box = screen.getByPlaceholderText(/Como foi o treino/);
    fireEvent.change(box, { target: { value: 'ok' } });
    await act(async () => { fireEvent.blur(box); });
    expect(h.workout.saveWorkoutNotes).toHaveBeenCalledWith('Segunda', 'ok');
  });

  it('erro ao salvar notas não quebra a tela', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.workout.saveWorkoutNotes.mockRejectedValue(new Error('rede'));
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Notas do treino/ }));
    const box = screen.getByPlaceholderText(/Como foi o treino/);
    fireEvent.change(box, { target: { value: 'x' } });
    await act(async () => { fireEvent.blur(box); });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('⚡ Modo treino chama onOpenLive', () => {
    const { onOpenLive } = setup();
    fireEvent.click(screen.getByRole('button', { name: '⚡ Modo treino' }));
    expect(onOpenLive).toHaveBeenCalledTimes(1);
  });

  it('abrir o modo ao vivo inicia o cronômetro e renderiza o modal', () => {
    setup({ liveOpen: true });
    expect(screen.getByRole('dialog', { name: 'ao vivo' })).toBeTruthy();
    expect(h.workout.saveWorkoutTimer).toHaveBeenCalled();
    expect(screen.getByTestId('ex-Supino').dataset.started).toBe('true');
  });

  it('fechar o modo ao vivo avisa a página e remonta as séries', () => {
    const { onCloseLive } = setup({ liveOpen: true });
    fireEvent.click(screen.getByRole('button', { name: 'fechar ao vivo' }));
    expect(onCloseLive).toHaveBeenCalledTimes(1);
  });

  it('finalizar pelo modo ao vivo fecha e abre o resumo', async () => {
    const { onCloseLive, onFinish } = setup({ liveOpen: true });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'fim ao vivo' })); });
    expect(onCloseLive).toHaveBeenCalled();
    expect(h.finishedSound).toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
