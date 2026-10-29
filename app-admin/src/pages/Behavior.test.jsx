// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock('../lib/supabase', () => ({ db: { rpc: mockRpc } }));

import Behavior from './Behavior';
import UserClientCard from '../components/UserClientCard';
import { buildAdoption, buildTutorialFunnel } from '../lib/adoption';

const render = ui => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

const DATA = {
  admin_visit_breakdown: [
    { dimension: 'device', value: 'celular', visits: 30 },
    { dimension: 'browser', value: 'safari', visits: 18 },
    { dimension: 'lang', value: 'pt', visits: 30 },
    { dimension: 'hour', value: '19', visits: 12 },
    { dimension: 'weekday', value: '1', visits: 12 },
  ],
  admin_auth_events: [
    { event: 'signup_start', detail: '', total: 20 },
    { event: 'signup_submit', detail: '', total: 10 },
    { event: 'signup_ok', detail: '', total: 5 },
    { event: 'signup_error', detail: 'termos', total: 4 },
  ],
  admin_user_events: [
    { event: '__active__', detail: '', users: 10, days: 30 },
    { event: 'page', detail: 'treino', users: 9, days: 20 },
    { event: 'feature', detail: 'live_mode', users: 5, days: 9 },
    { event: 'onboarding', detail: 'view', users: 4, days: 4 },
    { event: 'push', detail: 'open', users: 2, days: 2 },
    { event: 'tutorial', detail: 'aluno_1', users: 8, days: 8 },
    { event: 'tutorial', detail: 'aluno_2', users: 6, days: 6 },
    { event: 'tutorial', detail: 'aluno_pulou_2', users: 3, days: 3 },
    { event: 'tutorial', detail: 'aluno_fim', users: 2, days: 2 },
  ],
  admin_feature_adoption: [
    { fa_feature: '__active__', fa_users: 10, fa_prev_users: 8, fa_trained7: 6 },
    { fa_feature: 'live_mode', fa_users: 5, fa_prev_users: 4, fa_trained7: 4 },
  ],
  admin_client_breakdown: [
    { dimension: 'os', value: 'android', users: 7 },
    { dimension: 'display_mode', value: 'standalone', users: 4 },
    { dimension: 'app_version', value: '1.4.2', users: 7 },
  ],
  admin_install_retention: [{ display_mode: 'standalone', users: 4, trained_7d: 3 }],
  admin_workout_completion: [{ started: 20, completed: 15, avg_duration_seconds: 2700, median_duration_seconds: 2400 }],
  admin_workout_dropoff: [{ exercise_name: 'Agachamento Livre', total: 3 }],
  admin_visitor_stages: [
    { dimension: 'stage', value: 'so_landing', visitors: 5 },
    { dimension: 'stage', value: 'erro_cadastro', visitors: 3 },
    { dimension: 'stage', value: 'cadastrou', visitors: 2 },
    { dimension: 'stage_return', value: 'so_landing', visitors: 2 },
    { dimension: 'stage_return', value: 'erro_cadastro', visitors: 2 },
    { dimension: 'lost_days', value: '1', visitors: 4 },
    { dimension: 'lost_days', value: '3-5', visitors: 4 },
    { dimension: 'lost_source', value: 'instagram', visitors: 6 },
    { dimension: 'lost_source', value: 'direto', visitors: 2 },
    { dimension: 'lost_device', value: 'celular', visitors: 8 },
  ],
  admin_access_timeline: [
    { bucket_at: '2026-10-26T00:00:00', site_visits: 4, app_accesses: 6, app_users: 3 },
  ],
  admin_lost_visitors: [
    { lv_visitor: 'abcd1234', lv_first_at: '2026-10-18T22:00:00Z', lv_last_at: '2026-10-20T22:00:00Z', lv_days: 3,
      lv_source: 'instagram', lv_campaign: 'promo', lv_device: 'celular', lv_stage: 'erro_cadastro', lv_error: 'senha_curta' },
  ],
};

beforeEach(() => {
  mockRpc.mockReset().mockImplementation(name => Promise.resolve({ data: DATA[name] ?? [], error: null }));
});

describe('Behavior', () => {
  it('mostra visitantes, cadastro, uso, treinos e aparelhos', async () => {
    render(<Behavior />);

    expect(await screen.findByText('Agachamento Livre')).toBeTruthy();
    expect(screen.getByText('Não aceitou os Termos de Uso').closest('tr').textContent).toContain('4');
    expect(screen.getAllByText('Modo treino ao vivo')[0].closest('li').textContent).toContain('5 · 50%');
    expect(screen.getAllByText('Registro de água')[0].closest('li').textContent).toContain('0 · 0%');
    expect(screen.getByText(/Pouco descobertas/).closest('p').textContent).toContain('Registro de água');
    expect(screen.getByText('+40 p.p.')).toBeTruthy();
    expect(screen.getByText(/Aluno: 8 começaram · 2 concluíram \(25%\)/)).toBeTruthy();
    expect(screen.getByText('Passo 2 · 3 pularam aqui')).toBeTruthy();
    expect(screen.getAllByText('75%').length).toBeGreaterThan(0);
    expect(screen.getAllByText((_, el) => el?.tagName === 'SPAN' && el.textContent.startsWith('Pico: 19h')).length).toBeGreaterThan(0);
    expect(screen.getByText(/abriram o app por uma notificação/).textContent).toContain('20%');
    expect(screen.getAllByText('App instalado').length).toBeGreaterThan(0);
    expect(mockRpc).toHaveBeenCalledWith('admin_user_events', { days_back: 30 });
  });

  it('mostra quem visitou e não converteu, e onde parou', async () => {
    render(<Behavior />);

    const row = (await screen.findByText('abcd1234')).closest('tr');
    expect(row.textContent).toContain('Deu erro no cadastro');
    expect(row.textContent).toContain('Senha curta demais');
    expect(row.textContent).toContain('promo');
    expect(screen.getByText('Não converteram (8)').previousSibling.textContent).toBe('80%');
    expect(screen.getByText('Desses, voltaram em 2+ dias (4)').previousSibling.textContent).toBe('50%');
    expect(screen.getByText('Só viram a landing').closest('tr').textContent).toContain('50%');
    expect(mockRpc).toHaveBeenCalledWith('admin_lost_visitors', { days_back: 30, max_rows: 50 });
  });

  it('acessos no tempo: troca entre dia, hora e minuto', async () => {
    render(<Behavior />);
    // tile do pico, tabela de acessos e tabela acessível do gráfico
    expect((await screen.findAllByText('26/10/2026')).length).toBe(3);
    expect(mockRpc).toHaveBeenCalledWith('admin_access_timeline', { p_bucket: 'dia', p_buckets: 30 });
    fireEvent.click(screen.getByRole('button', { name: 'Por minuto' }));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('admin_access_timeline', { p_bucket: 'minuto', p_buckets: 120 }));
    fireEvent.click(screen.getByRole('button', { name: 'Por hora' }));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('admin_access_timeline', { p_bucket: 'hora', p_buckets: 48 }));
  });

  it('trocar o período recarrega as consultas', async () => {
    render(<Behavior />);
    await screen.findByText('Agachamento Livre');
    fireEvent.click(screen.getByRole('button', { name: '7 dias' }));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('admin_workout_dropoff', { days_back: 7, max_rows: 10 }));
  });

  it('uma consulta falhando não derruba os outros blocos', async () => {
    mockRpc.mockImplementation(name => Promise.resolve(
      name === 'admin_user_events' ? { data: null, error: new Error('function admin_user_events does not exist') } : { data: DATA[name] ?? [], error: null },
    ));
    render(<Behavior />);

    expect(await screen.findByText('Agachamento Livre')).toBeTruthy();
    expect(screen.getAllByText('function admin_user_events does not exist').length).toBe(3);
  });
});

describe('adoption', () => {
  it('compara com o período anterior e a retenção de quem usou com a dos demais', () => {
    const a = buildAdoption(DATA.admin_feature_adoption);
    const live = a.items.find(i => i.key === 'live_mode');
    expect(live).toMatchObject({ users: 5, pct: 50, change: 25, usedRate: 80, notUsedRate: 40, retentionLift: 40, low: false });
    expect(a.items.find(i => i.key === 'water')).toMatchObject({ users: 0, pct: 0, change: null, usedRate: null, low: true });
    expect(buildAdoption([]).low).toEqual([]);
  });

  it('funil do tutorial por papel com o passo de mais desistências', () => {
    const [aluno, ...rest] = buildTutorialFunnel(DATA.admin_user_events);
    expect(rest).toEqual([]);
    expect(aluno).toMatchObject({ role: 'aluno', started: 8, done: 2, donePct: 25, worstStep: { n: 2, skipped: 3 } });
    expect(aluno.steps.map(s => s.pctOfStart)).toEqual([100, 75]);
  });
});

describe('UserClientCard', () => {
  it('mostra o retrato do último acesso', async () => {
    mockRpc.mockResolvedValue({ data: [{ os: 'ios', browser: 'safari', device: 'celular', display_mode: 'browser', app_version: '1.4.2', lang: 'pt', push_permission: 'granted', last_seen: '2026-10-07' }], error: null });
    render(<UserClientCard userId="u1" />);
    expect(await screen.findByText('iOS (iPhone/iPad)')).toBeTruthy();
    expect(screen.getByText('07/10/2026')).toBeTruthy();
  });

  it('sem registro (ou sem usuário) não mostra nada', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const { container } = render(<UserClientCard userId="u1" />);
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    expect(container.textContent).toBe('');

    mockRpc.mockClear();
    render(<UserClientCard />);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
