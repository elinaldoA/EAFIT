// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

const { workout, mockToast, deleteChain, surveys, clock, history } = vi.hoisted(() => ({
  surveys: { fetchPendingSurvey: vi.fn() },
  clock: { name: 'Segunda', date: '2026-10-26' },
  history: { fetchRecentSets: vi.fn() },
  workout: {},
  mockToast: vi.fn(),
  deleteChain: { result: { error: null }, in: vi.fn(), eq: vi.fn() },
}));

vi.mock('../lib/supabase', () => ({
  db: { from: () => ({ delete: () => deleteChain }) },
}));
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../context/useWorkout', () => ({ useWorkout: () => workout }));
vi.mock('../context/useToast', () => ({ useToast: () => mockToast }));
// Dia fixo: o teste não pode depender do dia da semana em que roda.
vi.mock('../data/treinoData', async (importOriginal) => ({
  ...(await importOriginal()), todayName: () => clock.name, todayDate: () => clock.date,
}));
vi.mock('../lib/trainingCoach', async orig => ({ ...(await orig()), fetchRecentSets: (...a) => history.fetchRecentSets(...a) }));
vi.mock('../lib/muscleVolume', async orig => ({ ...(await orig()), fetchLibraryMap: () => Promise.resolve(new Map()) }));

// Filhos pesados viram stubs: aqui só importa o que a página decide mostrar.
vi.mock('../components/PauseBanner', () => ({ default: () => <div data-testid="aviso-pausa" /> }));
vi.mock('../components/PersonalMessages', () => ({ default: () => <div data-testid="aviso-recados" /> }));
vi.mock('../components/MyAppointments', () => ({ default: () => null }));
vi.mock('../components/DailyCheckin', () => ({ default: () => <div data-testid="aviso-checkin" /> }));
vi.mock('../components/RestTimer', () => ({ default: () => null }));
vi.mock('../components/WorkoutDayCard', () => ({ default: ({ day }) => <div data-testid="day-card">{day.dia}</div> }));
vi.mock('../components/PlanEditorModal', () => ({ default: () => <div role="dialog">editor de plano</div> }));
vi.mock('../components/WorkoutSummaryModal', () => ({ default: () => null }));
vi.mock('../lib/surveys', async orig => ({ ...(await orig()), fetchPendingSurvey: (...a) => surveys.fetchPendingSurvey(...a) }));
vi.mock('../components/SurveyPrompt', () => ({ default: ({ survey }) => <div role="dialog">pesquisa: {survey.question}</div> }));

import TreinoPage from './TreinoPage';

const SEGUNDA = { dia: 'Segunda', foco: 'Peito', exercicios: [{ nome: 'Supino', series: '3', reps: '10', descanso: '60s', tecnica: '' }], pos: [] };
const TERCA = { dia: 'Terça', foco: 'Costas', exercicios: [{ nome: 'Remada', series: '3', reps: '10', descanso: '60s', tecnica: '' }], pos: [] };

afterEach(cleanup);

// "Limpar a semana" fica no menu "⋯" da barra de ferramentas.
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Mais opções' }));
const clearWeek = () => { openMenu(); fireEvent.click(screen.getByRole('menuitem', { name: 'Limpar a semana' })); };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  surveys.fetchPendingSurvey.mockResolvedValue(null);
  history.fetchRecentSets.mockResolvedValue([]);
  Object.assign(clock, { name: 'Segunda', date: '2026-10-26' });
  deleteChain.result = { error: null };
  deleteChain.eq = vi.fn(() => deleteChain);
  deleteChain.in = vi.fn(() => Promise.resolve(deleteChain.result));
  Object.assign(workout, {
    dataVersion: 1, syncStatus: 'ok', syncNow: vi.fn().mockResolvedValue(undefined),
    activePlanDays: [SEGUNDA, TERCA], planExpired: false, planByTrainer: false,
    planStartDate: null, planEndDate: null, saveWorkoutRating: vi.fn(),
  });
});

describe('TreinoPage', () => {
  it('mostra a pesquisa pendente do painel um pouco depois de abrir', async () => {
    vi.useFakeTimers();
    surveys.fetchPendingSurvey.mockResolvedValue({ id: 's1', kind: 'nps', question: 'Indicaria?', options: [] });
    render(<TreinoPage />);
    expect(screen.queryByText('pesquisa: Indicaria?')).toBeNull();
    await vi.advanceTimersByTimeAsync(2600);
    vi.useRealTimers();
    expect(await screen.findByText('pesquisa: Indicaria?')).toBeTruthy();
  });

  it('"Pouco tempo hoje?" só aparece quando há o que enxugar', () => {
    const { unmount } = render(<TreinoPage />);
    expect(screen.queryByText(/Pouco tempo hoje/)).toBeNull(); // Supino 3×10: cerca de 7 min
    unmount();
    const longo = { ...SEGUNDA, exercicios: Array.from({ length: 8 }, (_, i) => ({ nome: `Ex ${i}`, series: '4', reps: '10', descanso: '90s', tecnica: '' })) };
    workout.activePlanDays = [longo, TERCA];
    render(<TreinoPage />);
    expect(screen.getByText(/Pouco tempo hoje/)).toBeTruthy();
  });

  it('mostra o treino de hoje e um card por dia do plano', () => {
    render(<TreinoPage />);
    expect(screen.getByText('Treino de hoje')).toBeTruthy();
    expect(screen.getByText('Peito')).toBeTruthy();
    expect(screen.getAllByTestId('day-card')).toHaveLength(2);
    expect(screen.getByText('0/2 treinos')).toBeTruthy();
  });

  it('o resumo do treino de hoje concorda o número de exercícios e mostra as séries', () => {
    render(<TreinoPage />);
    expect(document.querySelector('.today-card__meta').textContent).toMatch(/^Segunda · 1 exercício · 0\/3 séries/);
  });

  it('dia sem séries contáveis não escreve "false" no resumo', () => {
    const solto = { nome: 'Alongamento', series: '', reps: '', descanso: '', tecnica: '' };
    workout.activePlanDays = [{ ...SEGUNDA, exercicios: [solto, { ...solto, nome: 'Respiração' }] }, TERCA];
    render(<TreinoPage />);
    expect(document.querySelector('.today-card__meta').textContent).toBe('Segunda · 2 exercícios');
  });

  it('o botão do dia acompanha o progresso: começar, continuar e revisar', () => {
    const { unmount } = render(<TreinoPage />);
    expect(screen.getByText('⚡ Começar treino')).toBeTruthy();
    unmount();

    localStorage.setItem('set_Segunda_Supino_1_done', 'true');
    const second = render(<TreinoPage />);
    expect(screen.getByText('⚡ Continuar treino')).toBeTruthy();
    second.unmount();

    localStorage.setItem('treino_Segunda', 'true');
    render(<TreinoPage />);
    expect(screen.getByText('💪 Revisar treino')).toBeTruthy();
    expect(screen.getByText('1/2 treinos')).toBeTruthy();
  });

  it('enquanto sincroniza esconde o card de hoje e trava o "Limpar"', () => {
    workout.syncStatus = 'loading';
    render(<TreinoPage />);
    expect(screen.queryByText('Treino de hoje')).toBeNull();
    openMenu();
    expect(screen.getByRole('menuitem', { name: 'Limpar a semana' }).disabled).toBe(true);
  });

  it('o treino de hoje vem antes dos avisos: só a pausa fica acima dele', () => {
    render(<TreinoPage />);
    const before = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const hoje = document.querySelector('.today-card');
    expect(before(screen.getByTestId('aviso-pausa'), hoje)).toBe(true);
    expect(before(hoje, screen.getByTestId('aviso-checkin'))).toBe(true);
    expect(before(hoje, screen.getByTestId('aviso-recados'))).toBe(true);
  });

  it('Limpar e Importar ficam no menu "⋯", não soltos na tela', () => {
    render(<TreinoPage />);
    expect(screen.queryByRole('button', { name: /Limpar|Importar/ })).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
    openMenu();
    expect(screen.getByRole('menuitem', { name: 'Limpar a semana' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Importar treinos de outro app' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('plano vencido sem sucessor avisa e oferece escolher outro', () => {
    workout.planExpired = true;
    render(<TreinoPage />);
    fireEvent.click(screen.getByText('Escolher plano'));
    expect(screen.getByRole('dialog').textContent).toBe('editor de plano');
  });

  it('plano do personal mostra a nota de autoria', () => {
    workout.planByTrainer = true;
    render(<TreinoPage />);
    expect(screen.getByText('📋 Plano montado pelo seu personal')).toBeTruthy();
  });

  describe('Limpar', () => {
    beforeEach(() => {
      localStorage.setItem('treino_Segunda', 'true');
      localStorage.setItem('set_Segunda_Supino_1_done', 'true');
      localStorage.setItem('theme', 'dark');
    });

    it('limpar não pede confirmação e o aviso diz quantos treinos concluídos saíram', () => {
      const confirm = vi.spyOn(window, 'confirm');
      render(<TreinoPage />);
      clearWeek();
      expect(confirm).not.toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith('🧹 Semana apagada, inclusive os treinos concluídos (1 dia)', 6000, expect.objectContaining({ action: expect.objectContaining({ label: 'Desfazer' }) }));
    });

    it('sem treino concluído, o aviso fala só de checks e cargas', () => {
      localStorage.removeItem('treino_Segunda');
      render(<TreinoPage />);
      clearWeek();
      expect(mockToast).toHaveBeenCalledWith('🧹 Checks e cargas limpos', 6000, expect.anything());
    });

    it('apaga o cache na hora e remove os treinos da semana no servidor só em 6s, ressincronizando', async () => {
      render(<TreinoPage />);
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        clearWeek();
        expect(localStorage.getItem('treino_Segunda')).toBeNull();
        expect(localStorage.getItem('set_Segunda_Supino_1_done')).toBeNull();
        expect(localStorage.getItem('theme')).toBe('dark');
        expect(deleteChain.in).not.toHaveBeenCalled();
        await act(async () => { await vi.advanceTimersByTimeAsync(6100); });
        expect(deleteChain.eq).toHaveBeenCalledWith('user_id', 'u1');
        expect(deleteChain.in.mock.calls[0][1]).toHaveLength(2);
        expect(workout.syncNow).toHaveBeenCalled();
      } finally { vi.useRealTimers(); }
    });

    it('Desfazer devolve checks e cargas e o servidor nunca é tocado', async () => {
      render(<TreinoPage />);
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        clearWeek();
        act(() => { mockToast.mock.calls.at(-1)[2].action.onClick(); });
        expect(localStorage.getItem('treino_Segunda')).toBe('true');
        expect(localStorage.getItem('set_Segunda_Supino_1_done')).toBe('true');
        await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
        expect(deleteChain.in).not.toHaveBeenCalled();
        expect(workout.syncNow).not.toHaveBeenCalled();
      } finally { vi.useRealTimers(); }
    });

    it('falha no servidor: limpa só o local e avisa', async () => {
      deleteChain.result = { error: new Error('rede') };
      render(<TreinoPage />);
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        clearWeek();
        await act(async () => { await vi.advanceTimersByTimeAsync(6100); });
        expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('falhou ao sincronizar'));
        expect(workout.syncNow).not.toHaveBeenCalled();
      } finally { vi.useRealTimers(); }
    });
  });

  describe('assistente do dia', () => {
    it('dia livre com treino perdido na semana oferece recuperar', async () => {
      Object.assign(clock, { name: 'Quarta', date: '2026-10-28' });
      localStorage.setItem('treino_Segunda', 'true');
      const { container } = render(<TreinoPage />);
      expect(await screen.findByText('Hoje está livre e o treino de Terça (Costas) ficou para trás.')).toBeTruthy();
      expect(screen.getByText('⚡ Recuperar treino de Terça')).toBeTruthy();
      expect(container.querySelectorAll('.week-strip__day--missed')).toHaveLength(1);
    });

    it('aponta o exercício pronto para subir carga e mostra o volume contra a semana passada', async () => {
      history.fetchRecentSets.mockResolvedValue([
        { exercise_name: 'Supino', carga: 50, reps: 10, workout_date: '2026-10-19' },
        { exercise_name: 'Supino', carga: 60, reps: 10, workout_date: '2026-10-26' },
      ]);
      render(<TreinoPage />);
      expect(await screen.findByText('1 exercício pronto para subir carga hoje.')).toBeTruthy();
      expect(screen.getByText('Supino: suba para 52,5 kg (fez 10 reps com 50 kg).')).toBeTruthy();
      expect(screen.getByText(/Volume da semana: 600kg/)).toBeTruthy();
      expect(screen.getByText(/\+20% vs\. o mesmo ponto/)).toBeTruthy();
    });

    it('depois de 5 semanas puxadas seguidas, avisa que esta é a semana leve', async () => {
      history.fetchRecentSets.mockResolvedValue(['2026-10-19', '2026-10-12', '2026-10-05', '2026-09-28', '2026-09-21']
        .map(d => ({ exercise_name: 'Remada', carga: 50, reps: 10, workout_date: d })));
      const { container } = render(<TreinoPage />);
      expect(await screen.findByText(/5 semanas seguidas de treino puxado/)).toBeTruthy();
      expect(container.querySelector('.footer').textContent).toContain('Deload esta semana');
    });
  });
});
