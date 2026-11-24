// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  user: { id: 'u1' },
  refreshPlan: vi.fn(),
  toast: vi.fn(),
  fetchProgressionSuggestion: vi.fn(),
  fetchPlateauStatus: vi.fn(),
  fetchRecentDiscomfort: vi.fn(),
  substituteExercise: vi.fn(),
  coachSuggest: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/coach', () => ({ coachSuggest: (...a) => h.coachSuggest(...a) }));
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('../context/useWorkout', () => ({ useWorkout: () => ({ refreshPlan: h.refreshPlan }) }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../lib/records', () => ({
  fetchProgressionSuggestion: (...a) => h.fetchProgressionSuggestion(...a),
  fetchPlateauStatus: (...a) => h.fetchPlateauStatus(...a),
  fetchExerciseSetsWithDates: () => Promise.resolve([]),
  doubleProgressionRule: () => null,
}));
vi.mock('./ExerciseNote', () => ({ default: () => null }));
vi.mock('./ExerciseHistory', () => ({ default: () => null }));
vi.mock('./ExerciseMuscle', () => ({ default: () => null }));
vi.mock('../lib/discomfort', () => ({ fetchRecentDiscomfort: (...a) => h.fetchRecentDiscomfort(...a) }));
vi.mock('../lib/workoutPlans', () => ({ substituteExercise: (...a) => h.substituteExercise(...a) }));
// Filhos pesados viram stubs: aqui importa o que o bloco decide mostrar.
vi.mock('./SetRow', () => ({ default: ({ n }) => <div data-testid="set-row">série {n}</div> }));
vi.mock('./CardioRow', () => ({ default: () => <div data-testid="cardio-row" /> }));
vi.mock('./ExerciseDemo', () => ({ default: () => <span data-testid="demo" /> }));
vi.mock('./WarmupSets', () => ({ default: () => <div data-testid="warmup" /> }));
vi.mock('./ExerciseSwap', () => ({ default: () => <div data-testid="swap" /> }));
vi.mock('./DiscomfortWidgets', () => ({ DiscomfortPanel: () => <div data-testid="discomfort-panel" /> }));

import ExerciseBlock from './ExerciseBlock';

const EX = { id: 'e1', nome: 'Supino Reto com Barra', series: '3', reps: '8-10', descanso: '90s', tecnica: 'Controle' };
const DAY = { dia: 'Segunda', exercicios: [EX], pos: [] };

function setup(props = {}) {
  const fns = { bump: vi.fn(), onRestStart: vi.fn(), onToggleAll: vi.fn(), onFillOthers: vi.fn(), onApplySuggestion: vi.fn() };
  render(<ExerciseBlock ex={EX} day={DAY} open version={0} started {...fns} {...props} />);
  return fns;
}

beforeEach(() => {
  localStorage.clear();
  h.user = { id: 'u1' };
  h.refreshPlan.mockReset().mockResolvedValue(undefined);
  h.toast.mockReset();
  h.fetchProgressionSuggestion.mockReset().mockResolvedValue(null);
  h.fetchPlateauStatus.mockReset().mockResolvedValue(null);
  h.fetchRecentDiscomfort.mockReset().mockResolvedValue(null);
  h.substituteExercise.mockReset().mockResolvedValue(undefined);
  h.coachSuggest.mockReset();
});
afterEach(cleanup);

describe('ExerciseBlock', () => {
  it('mostra nome, meta e uma linha por série', () => {
    setup();
    expect(screen.getByText('Supino Reto com Barra')).toBeTruthy();
    expect(screen.getByText('8-10 reps · desc. 90s')).toBeTruthy();
    expect(screen.getAllByTestId('set-row')).toHaveLength(3);
  });

  it('hideName omite nome e meta (o modo ao vivo mostra os dele)', () => {
    setup({ hideName: true });
    expect(screen.queryByText('Supino Reto com Barra')).toBeNull();
    expect(screen.getAllByTestId('set-row')).toHaveLength(3);
  });

  it('ao vivo: troca de exercício e painel de desconforto ficam dentro de "Mais" (fechado); na lista, soltos', () => {
    const { unmount } = render(<ExerciseBlock ex={EX} day={DAY} open version={0} started hideName bump={vi.fn()} onRestStart={vi.fn()} onToggleAll={vi.fn()} onFillOthers={vi.fn()} onApplySuggestion={vi.fn()} />);
    const more = screen.getByText('⋯ Mais').closest('details');
    expect(more.open).toBe(false);
    expect(more.contains(screen.getByTestId('swap'))).toBe(true);
    expect(more.contains(screen.getByTestId('discomfort-panel'))).toBe(true);
    unmount();
    setup();
    expect(screen.queryByText('⋯ Mais')).toBeNull();
    expect(screen.getByTestId('swap')).toBeTruthy();
  });

  it('aquecimento: ao vivo fica recolhido; na lista, solto', () => {
    const exW = { ...EX, aquecimento: 2 };
    const props = { day: DAY, open: true, version: 0, started: true, bump: vi.fn(), onRestStart: vi.fn(), onToggleAll: vi.fn(), onFillOthers: vi.fn(), onApplySuggestion: vi.fn() };
    const { unmount } = render(<ExerciseBlock ex={exW} hideName {...props} />);
    const det = screen.getByText('🔥 Aquecimento (2 séries)').closest('details');
    expect(det.open).toBe(false);
    expect(det.contains(screen.getByTestId('warmup'))).toBe(true);
    unmount();
    render(<ExerciseBlock ex={exW} {...props} />);
    expect(screen.queryByText('🔥 Aquecimento (2 séries)')).toBeNull();
    expect(screen.getByTestId('warmup')).toBeTruthy();
  });

  it('Marcar todas dispara o callback; vira ✓ Todas quando todas as séries estão feitas', () => {
    const { onToggleAll } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Marcar todas' }));
    expect(onToggleAll).toHaveBeenCalledTimes(1);

    cleanup();
    for (const n of [1, 2, 3]) localStorage.setItem(`set_Segunda_${EX.nome}_${n}_done`, 'true');
    setup();
    expect(screen.getByRole('button', { name: '✓ Todas' })).toBeTruthy();
  });

  it('treino não iniciado trava Marcar todas', () => {
    setup({ started: false });
    expect(screen.getByRole('button', { name: 'Marcar todas' }).disabled).toBe(true);
  });

  it('exibe a sugestão de progressão e aplica carga e reps', async () => {
    h.fetchProgressionSuggestion.mockResolvedValue({ suggestedCarga: 82.5, suggestedReps: 9, lastCarga: 80, lastReps: 8 });
    const { onApplySuggestion } = setup();
    await waitFor(() => expect(screen.getByText(/Sugestão: repita 82.5kg, mas tente 9 reps/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '🎯 Usar sugestão' }));
    expect(onApplySuggestion).toHaveBeenCalledWith(82.5, 9);
  });

  it('sugestão sem reps mostra só a carga', async () => {
    h.fetchProgressionSuggestion.mockResolvedValue({ suggestedCarga: 85, suggestedReps: null, lastCarga: 82.5, lastReps: 10 });
    setup();
    await waitFor(() => expect(screen.getByText(/Sugestão: 85kg/)).toBeTruthy());
  });

  it('estagnação tem prioridade sobre a sugestão e propõe deload', async () => {
    h.fetchProgressionSuggestion.mockResolvedValue({ suggestedCarga: 82.5, suggestedReps: null, lastCarga: 80, lastReps: 8 });
    h.fetchPlateauStatus.mockResolvedValue({ sessionsStuck: 3, lastCarga: 80, suggestedDeload: 72 });
    const { onApplySuggestion } = setup();
    await waitFor(() => expect(screen.getByText(/Estagnado há/)).toBeTruthy());
    expect(screen.queryByText(/Sugestão: repita/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '🎯 Usar sugestão' }));
    expect(onApplySuggestion).toHaveBeenCalledWith(72, null);
  });

  describe('dica de primeira vez (sem histórico no exercício)', () => {
    const HINT = /Primeira vez neste exercício: comece com uma carga leve/;

    it('aparece quando a busca termina sem sugestão', async () => {
      setup();
      expect(await screen.findByText(HINT)).toBeTruthy();
    });

    it('não pisca enquanto o histórico ainda carrega', async () => {
      h.fetchProgressionSuggestion.mockReturnValue(new Promise(() => {}));
      setup();
      await waitFor(() => expect(h.fetchProgressionSuggestion).toHaveBeenCalled());
      expect(screen.queryByText(HINT)).toBeNull();
    });

    it('some quando existe sugestão de progressão', async () => {
      h.fetchProgressionSuggestion.mockResolvedValue({ suggestedCarga: 82.5, suggestedReps: 9, lastCarga: 80, lastReps: 8 });
      setup();
      await screen.findByText(/Sugestão: repita 82.5kg/);
      expect(screen.queryByText(HINT)).toBeNull();
    });

    it('não aparece se a busca falhar (não dá para saber se é a primeira vez)', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      h.fetchProgressionSuggestion.mockRejectedValue(new Error('rede'));
      setup();
      await waitFor(() => expect(err).toHaveBeenCalled());
      expect(screen.queryByText(HINT)).toBeNull();
      err.mockRestore();
    });

    it('não aparece depois que a pessoa já digitou a carga da 1ª série', async () => {
      localStorage.setItem(`set_Segunda_${EX.nome}_1_carga`, '40');
      setup();
      await waitFor(() => expect(h.fetchProgressionSuggestion).toHaveBeenCalled());
      await new Promise(r => setTimeout(r, 0));
      expect(screen.queryByText(HINT)).toBeNull();
      localStorage.removeItem(`set_Segunda_${EX.nome}_1_carga`);
    });
  });

  it('bloco fechado ou sem usuário não consulta sugestões', () => {
    setup({ open: false });
    expect(h.fetchProgressionSuggestion).not.toHaveBeenCalled();
    cleanup();
    h.user = null;
    setup();
    expect(h.fetchProgressionSuggestion).not.toHaveBeenCalled();
  });

  it('falha ao buscar sugestão não quebra o bloco', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.fetchProgressionSuggestion.mockRejectedValue(new Error('rede'));
    setup();
    await waitFor(() => expect(err).toHaveBeenCalled());
    expect(screen.getAllByTestId('set-row')).toHaveLength(3);
    err.mockRestore();
  });

  it('com dor forte oferece a alternativa mais segura e troca no plano', async () => {
    h.fetchRecentDiscomfort.mockResolvedValue({ severity: 'forte' });
    setup();
    const btn = await screen.findByRole('button', { name: /Trocar por: Supino Reto na Máquina/ });
    fireEvent.click(btn);
    await waitFor(() => expect(h.substituteExercise).toHaveBeenCalledWith('e1', expect.objectContaining({
      nome: 'Supino Reto na Máquina', series: '3', reps: '8-10', descanso: '90s',
    })));
    expect(h.toast).toHaveBeenCalledWith('🔄 Trocado por Supino Reto na Máquina');
    expect(h.refreshPlan).toHaveBeenCalled();
  });

  it('desconforto leve não oferece a troca', async () => {
    h.fetchRecentDiscomfort.mockResolvedValue({ severity: 'leve' });
    setup();
    await waitFor(() => expect(h.fetchRecentDiscomfort).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Trocar por:/ })).toBeNull();
  });

  it('erro na troca avisa com um toast', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.fetchRecentDiscomfort.mockResolvedValue({ severity: 'lesao' });
    h.substituteExercise.mockRejectedValue(new Error('falhou'));
    setup();
    fireEvent.click(await screen.findByRole('button', { name: /Trocar por:/ }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('⚠️ Erro ao trocar o exercício'));
    err.mockRestore();
  });

  it('troca geral só aparece para exercício de força do plano e com id', () => {
    setup();
    expect(screen.getByTestId('swap')).toBeTruthy();
    cleanup();
    setup({ ex: { ...EX, id: undefined } });
    expect(screen.queryByTestId('swap')).toBeNull();
  });

  it('item sem séries: só o cabeçalho; cardio ganha a linha de cardio', () => {
    setup({ ex: { nome: '🏃 Cardio — Esteira', series: '-', reps: '20min', descanso: '-' } });
    expect(screen.queryByTestId('set-row')).toBeNull();
    expect(screen.getByTestId('cardio-row')).toBeTruthy();
    cleanup();
    setup({ ex: { nome: 'Alongar', series: '-', reps: '5min', descanso: '-' } });
    expect(screen.queryByTestId('cardio-row')).toBeNull();
  });

  it('no modo ao vivo o treinador fala a sugestão; na lista e em exercício concluído, não', async () => {
    const suggestion = { lastCarga: 80, lastReps: 10, suggestedCarga: 82.5, suggestedReps: null };
    h.fetchProgressionSuggestion.mockResolvedValue(suggestion);
    setup({ hideName: true });
    await waitFor(() => expect(h.coachSuggest).toHaveBeenCalledWith(suggestion, null));

    cleanup();
    h.coachSuggest.mockClear();
    setup();
    await screen.findByText(/Sugestão: 82.5kg/);
    expect(h.coachSuggest).not.toHaveBeenCalled();

    cleanup();
    for (const n of [1, 2, 3]) localStorage.setItem(`set_Segunda_${EX.nome}_${n}_done`, 'true');
    setup({ hideName: true });
    await waitFor(() => expect(h.fetchPlateauStatus).toHaveBeenCalledTimes(3));
    await Promise.resolve();
    expect(h.coachSuggest).not.toHaveBeenCalled();
  });
});
