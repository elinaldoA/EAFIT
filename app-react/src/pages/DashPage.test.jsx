// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';

const { dash, appConfig, workout } = vi.hoisted(() => ({
  dash: {},
  appConfig: { config: { flags: {} } },
  workout: { activePlanDays: [] },
}));

const USER = { id: 'u1', user_metadata: {} };
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: USER }) }));
vi.mock('../context/useAppConfig', () => ({ useAppConfig: () => appConfig }));
vi.mock('../context/useWorkout', () => ({ useWorkout: () => workout }));
vi.mock('../context/useToast', () => ({ useToast: () => vi.fn() }));
vi.mock('../hooks/useDashboardData', () => ({ useDashboardData: () => dash }));
vi.mock('../lib/supabase', () => ({ db: {} }));

// Dia fixo (o teste não pode depender do dia em que roda).
vi.mock('../data/treinoData', async (importOriginal) => ({
  ...(await importOriginal()), todayName: () => 'Segunda', todayDate: () => '2026-10-07',
}));

// Filhos pesados viram stubs: a página só decide o que mostrar e passa dados.
vi.mock('../components/BodyAvatar', () => ({ default: ({ activeGroups }) => <div data-testid="avatar">{activeGroups.size}</div> }));
vi.mock('../components/LineChart', () => ({ default: ({ points }) => <div data-testid="line-chart">{points.length}</div> }));
vi.mock('../components/ProgressPhotos', () => ({ default: () => <div data-testid="photos" /> }));
vi.mock('../components/MonthlyRecap', () => ({ default: () => null }));
vi.mock('../components/Challenges', () => ({ default: () => null }));
vi.mock('../components/Friends', () => ({ default: ({ myWeek }) => <div data-testid="friends">semana {myWeek}</div> }));
vi.mock('../components/BodyMeasurements', () => ({ default: () => null }));
vi.mock('../components/CheckinInsights', () => ({ default: () => null }));
vi.mock('../components/DiscomfortWidgets', () => ({
  DiscomfortPanel: ({ exerciseName }) => <div data-testid="discomfort">{exerciseName}</div>,
  DiscomfortHistory: () => null,
}));
vi.mock('../components/DashCharts', () => ({
  Heatmap: () => null, WeeklyBars: () => null, WeekCompare: () => null, LoadHistory: () => null,
  PRList: ({ logs }) => <div data-testid="pr-list">{logs.length}</div>,
}));

import DashPage from './DashPage';
import { BADGES } from '../lib/achievements';

const SEGUNDA = { dia: 'Segunda', foco: 'Peito', exercicios: [], pos: [] };

function baseDash(overrides = {}) {
  return {
    workouts: [], logs: [], allTimeLogs: [], loading: false, loadingPR: false,
    unlockedBadges: new Set(), discomfortHistory: [], weightLogs: [], exercises: [],
    volumePoints: [], handleRefreshRecords: vi.fn(),
    ...overrides,
  };
}

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  appConfig.config = { flags: {} };
  workout.activePlanDays = [SEGUNDA];
  Object.keys(dash).forEach(k => delete dash[k]);
  Object.assign(dash, baseDash());
});

function kpi(label) {
  return screen.getByText(label, { exact: false }).closest('.dash-kpi').querySelector('.dash-kpi__value').textContent;
}

describe('DashPage', () => {
  it('KPIs: treinos em 30 dias, sequência atual e exercícios com recorde', () => {
    Object.assign(dash, baseDash({
      workouts: [
        { id: 1, workout_date: '2026-10-07', completed: true, day_of_week: 'Segunda' },
        { id: 2, workout_date: '2026-10-06', completed: true, day_of_week: 'Domingo' },
        { id: 3, workout_date: '2026-10-05', completed: false, day_of_week: 'Sábado' },
        { id: 4, workout_date: '2026-08-01', completed: true, day_of_week: 'Sábado' },
      ],
      allTimeLogs: [
        { exercise_name: 'Supino', carga: '80', workout_date: '2026-10-07' },
        { exercise_name: 'Supino', carga: '70', workout_date: '2026-10-01' },
        { exercise_name: 'Remada', carga: '50', workout_date: '2026-10-01' },
      ],
      unlockedBadges: new Set([BADGES[0].id]),
    }));
    render(<DashPage active />);
    expect(kpi('30 dias')).toBe('2');
    expect(kpi('com recorde')).toBe('2');
    expect(kpi('Conquistas')).toBe(`1/${BADGES.length}`);
    expect(kpi('atual')).toMatch(/^\d+d$/);
  });

  it('enquanto carrega os KPIs mostram "–"', () => {
    Object.assign(dash, baseDash({ loading: true, loadingPR: true }));
    render(<DashPage active />);
    expect(kpi('30 dias')).toBe('–');
    expect(kpi('com recorde')).toBe('–');
  });

  it('o gráfico de carga abre no exercício treinado mais recentemente', () => {
    Object.assign(dash, baseDash({
      exercises: ['Remada', 'Supino'],
      logs: [
        { exercise_name: 'Remada', carga: '40', workout_date: '2026-09-20' },
        { exercise_name: 'Supino', carga: '60', workout_date: '2026-10-02' },
      ],
    }));
    render(<DashPage active />);
    expect(screen.getByLabelText('Exercício').value).toBe('Supino');
    expect(screen.getByTestId('discomfort').textContent).toBe('Supino');

    fireEvent.change(screen.getByLabelText('Exercício'), { target: { value: 'Remada' } });
    expect(screen.getByTestId('discomfort').textContent).toBe('Remada');
  });

  it('avatar: hoje sem treino concluído não marca grupos e explica o motivo', () => {
    render(<DashPage active />);
    expect(screen.getByTestId('avatar').textContent).toBe('0');
    expect(screen.getByText(/treino de hoje ainda não concluído/)).toBeTruthy();
  });

  it('sem treino planejado para hoje avisa', () => {
    workout.activePlanDays = [];
    render(<DashPage active />);
    expect(screen.getByText('Sem treino planejado para hoje')).toBeTruthy();
  });

  describe('abas', () => {
    it('abre em Treinos e lembra a aba escolhida', () => {
      const { unmount } = render(<DashPage active />);
      expect(screen.getByText('Visualização Anatômica')).toBeTruthy();
      fireEvent.click(screen.getByRole('tab', { name: 'Recordes' }));
      expect(localStorage.getItem('dash_tab')).toBe('recordes');
      unmount();

      render(<DashPage active />);
      expect(screen.getByRole('tab', { name: 'Recordes' }).getAttribute('aria-selected')).toBe('true');
    });

    it('Recordes: lista os PRs e atualiza sob demanda', () => {
      localStorage.setItem('dash_tab', 'recordes');
      Object.assign(dash, baseDash({ allTimeLogs: [{ exercise_name: 'Supino', carga: '80', workout_date: '2026-10-07' }] }));
      render(<DashPage active />);
      expect(screen.getByTestId('pr-list').textContent).toBe('1');
      fireEvent.click(screen.getByLabelText('Atualizar recordes'));
      expect(dash.handleRefreshRecords).toHaveBeenCalled();
    });

    it('Corpo: fotos de progresso respeitam a chave do painel admin', () => {
      localStorage.setItem('dash_tab', 'corpo');
      const { unmount } = render(<DashPage active />);
      expect(screen.getByTestId('photos')).toBeTruthy();
      unmount();

      appConfig.config = { flags: { fotos_progresso: false } };
      render(<DashPage active />);
      expect(screen.queryByTestId('photos')).toBeNull();
    });

    it('Amigos: recebe quantos dias treinou nos últimos 7', () => {
      localStorage.setItem('dash_tab', 'amigos');
      Object.assign(dash, baseDash({
        workouts: [
          { id: 1, workout_date: '2026-10-07', completed: true },
          { id: 2, workout_date: '2026-10-05', completed: true },
          { id: 3, workout_date: '2026-09-20', completed: true },
        ],
      }));
      render(<DashPage active />);
      expect(within(screen.getByTestId('friends')).getByText('semana 2')).toBeTruthy();
    });

    it('valor inválido guardado no storage cai em Treinos', () => {
      localStorage.setItem('dash_tab', 'xyz');
      render(<DashPage active />);
      expect(screen.getByRole('tab', { name: 'Treinos' }).getAttribute('aria-selected')).toBe('true');
    });
  });
});
