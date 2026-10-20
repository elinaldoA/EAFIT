// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const { lib } = vi.hoisted(() => ({ lib: { fetchAppView: vi.fn() } }));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/appView', async orig => ({ ...(await orig()), ...lib }));

import UserAppViewTab from './UserAppViewTab';
import { buildAppView, dayName } from '../lib/appView';
import { todayStr } from '../lib/community';

const plan = {
  name: 'Hipertrofia', end_date: null,
  plan_days: [{ dia: 'Segunda', foco: 'Peito', plan_exercises: [
    { id: 1, nome: 'Supino', series: 4, reps: '10', descanso: '60s' },
    { id: 2, nome: 'Alongamento', series: 1, reps: '1', is_post_workout: true },
  ] }],
};
const view = {
  experiments: [{ key: 'btn', name: 'Botão novo', variant: 'b', flag: null }],
  survey: { question: 'Gostou?', kind: 'nps' }, unread: 1, week_days: 2, last_day: '2026-10-18',
  inbox: [{ title: 'Oi', body: 'Corpo', kind: 'aviso', created_at: '2026-10-19T12:00:00Z', read_at: null }],
};
const settings = {
  banner: { enabled: true, message: 'Novidade', startsOn: '', endsOn: '', level: 'info' },
  season: { enabled: true, periods: [{ theme: 'natal', startsOn: '2026-10-01', endsOn: '2026-10-31' }] },
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('appView', () => {
  it('acha o treino do dia pelo nome, respeita pausa e período do aviso', () => {
    expect(dayName('2026-10-19')).toBe('Segunda');
    const v = buildAppView({ plan, metadata: { weeklyGoal: 4 }, settings, view }, '2026-10-19');
    expect(v.day.foco).toBe('Peito');
    expect(v.day.exercises.map(e => e.nome)).toEqual(['Supino']);
    expect(v).toMatchObject({ weekDays: 2, weekGoal: 4, unread: 1, paused: null, lang: 'pt' });
    expect(v.banner.message).toBe('Novidade');
    expect(v.theme).toBeTruthy();

    expect(buildAppView({ plan, metadata: {}, settings, view }, '2026-10-20').day).toBeNull();
    expect(buildAppView({ plan, metadata: { pausedUntil: '2026-10-25' }, settings, view }, '2026-10-19').paused).toBe('2026-10-25');
    const later = { ...settings, banner: { ...settings.banner, startsOn: '2026-11-01' } };
    expect(buildAppView({ plan, settings: later, view }, '2026-10-19').banner).toBeNull();
  });
});

describe('UserAppViewTab', () => {
  it('mostra aviso, pesquisa, experimentos e caixa de notificações', async () => {
    lib.fetchAppView.mockResolvedValue({ view, settings });
    const today = todayStr();
    const todayPlan = { ...plan, plan_days: [{ ...plan.plan_days[0], dia: dayName(today) }] };
    render(<UserAppViewTab userId="u1" plan={todayPlan} metadata={{}} />);
    expect(await screen.findByText(/Novidade/)).toBeTruthy();
    expect(lib.fetchAppView).toHaveBeenCalledWith('u1');
    expect(screen.getByText('Gostou?')).toBeTruthy();
    expect(screen.getByText(/Supino/)).toBeTruthy();
    expect(screen.getByText('b')).toBeTruthy();
    expect(screen.getByText('Oi')).toBeTruthy();
  });

  it('sem plano mostra o convite', async () => {
    lib.fetchAppView.mockResolvedValue({ view: { ...view, experiments: [], inbox: [] }, settings: {} });
    render(<UserAppViewTab userId="u1" plan={null} metadata={{}} />);
    expect(await screen.findByText(/Sem plano ativo/)).toBeTruthy();
    expect(screen.getByText('Fora de experimentos rodando.')).toBeTruthy();
  });
});
