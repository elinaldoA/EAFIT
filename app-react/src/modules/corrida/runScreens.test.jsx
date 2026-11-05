// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  user: { id: 'u1', user_metadata: {} },
  updateProfile: vi.fn(async () => ({ error: null })),
  toast: vi.fn(),
  saveRun: vi.fn(async (uid, run) => ({ run, pending: false })),
  fetchRuns: vi.fn(async () => []),
  fetchRunFeed: vi.fn(async () => []),
  toggleKudos: vi.fn(async () => ({ kudos: 1, kudoed: true })),
  fetchFriendsWeek: vi.fn(async () => []),
}));

vi.mock('../../lib/supabase', () => ({ db: {} }));
vi.mock('../../context/useAuth', () => ({ useAuth: () => ({ user: h.user, updateProfile: h.updateProfile }) }));
vi.mock('../../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../../hooks/useWakeLock', () => ({ useWakeLock: () => {} }));
vi.mock('../../hooks/useBackToClose', () => ({ useBackToClose: () => {} }));
vi.mock('../../lib/voice', () => ({ speak: vi.fn(), cancelSpeech: vi.fn() }));
vi.mock('../../lib/tracking', () => ({ trackEvent: vi.fn() }));
vi.mock('./runs', async (orig) => ({
  ...(await orig()),
  saveRun: (...a) => h.saveRun(...a),
  fetchRuns: (...a) => h.fetchRuns(...a),
  fetchRunFeed: (...a) => h.fetchRunFeed(...a),
  toggleKudos: (...a) => h.toggleKudos(...a),
  fetchFriendsWeek: (...a) => h.fetchFriendsWeek(...a),
  flushPendingRuns: async () => 0,
}));
vi.mock('../../lib/friends', () => ({
  friendlyFriendError: e => e.message, normalizeFriendCode: c => c.toUpperCase(), shareFriendCode: vi.fn(),
  fetchMyFriendProfile: async () => ({ code: 'ANA7K2', share: true }), setShareActivity: vi.fn(),
  requestFriend: vi.fn(), respondFriend: vi.fn(), removeFriendship: vi.fn(), fetchMyFriends: async () => [],
}));

import LiveRunHost from './LiveRunHost';
import RunHomePage from './RunHomePage';
import RunFeedPage from './RunFeedPage';
import RunChallengesPage from './RunChallengesPage';
import { setLiveRun, startRun, setDistance, getLiveRun, resetLiveRunCache } from './liveRun';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetLiveRunCache();
  h.user = { id: 'u1', user_metadata: {} };
});
afterEach(() => { cleanup(); act(() => { setLiveRun(null); }); });

describe('LiveRunHost', () => {
  it('sem corrida não mostra nada', () => {
    const { container } = render(<LiveRunHost />);
    expect(container.innerHTML).toBe('');
  });

  it('salvar sem mexer na distância mantém o tempo por km do GPS', async () => {
    const t0 = Date.now() - 400_000;
    let run = startRun({ gps: true }, t0);
    run = setDistance(run, 1000, t0 + 300_000);
    run = setDistance(run, 1234, t0 + 380_000);
    act(() => { setLiveRun(run); });
    render(<LiveRunHost />);
    expect(screen.getByRole('dialog', { name: 'Corrida em andamento' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Finalizar/ }));
    expect(screen.getByLabelText('Distância (km)').value).toBe('1,23');
    fireEvent.click(screen.getByRole('button', { name: '7' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar corrida' })); });

    await waitFor(() => expect(h.saveRun).toHaveBeenCalled());
    const saved = h.saveRun.mock.calls[0][1];
    expect(saved).toMatchObject({ distance_m: 1234, splits: [300], gps: true, effort: 7 });
    expect(getLiveRun()).toBeNull();
  });

  it('distância digitada vale, sem tempo por km', async () => {
    act(() => { setLiveRun(startRun({ gps: false }, Date.now() - 60_000)); });
    render(<LiveRunHost />);
    fireEvent.click(screen.getByRole('button', { name: /Finalizar/ }));
    fireEvent.change(screen.getByLabelText('Distância (km)'), { target: { value: '5,2' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar corrida' })); });
    await waitFor(() => expect(h.saveRun).toHaveBeenCalled());
    expect(h.saveRun.mock.calls[0][1]).toMatchObject({ distance_m: 5200, splits: [], gps: false });
  });

  it('descartar pede um segundo toque', () => {
    act(() => { setLiveRun(startRun({}, Date.now())); });
    render(<LiveRunHost />);
    fireEvent.click(screen.getByRole('button', { name: /Finalizar/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Descartar corrida' }));
    expect(getLiveRun()).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Toque de novo para descartar' }));
    expect(getLiveRun()).toBeNull();
  });
});

describe('RunHomePage (aba Gravar)', () => {
  it('o botão grande começa uma corrida livre sem programa', () => {
    render(<RunHomePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Começar corrida' }));
    expect(getLiveRun()).toMatchObject({ session: null });
  });

  it('o programa é opcional: abre a montagem e salva na conta', async () => {
    render(<RunHomePage />);
    expect(screen.queryByText('Monte seu programa de corrida')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Quer um plano/ }));
    expect(screen.queryByRole('button', { name: 'Meia maratona' })).toBeNull(); // iniciante não vê meia
    fireEvent.click(screen.getByRole('button', { name: '10K' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Começar programa' })); });
    expect(h.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ runGoal: '10k', runNivel: 'iniciante' }));
  });

  it('com programa mostra a semana e permite encerrar', async () => {
    h.user = { id: 'u1', user_metadata: { runGoal: '5k', runNivel: 'intermediario', runStart: '2026-11-02' } };
    render(<RunHomePage />);
    await act(async () => {});
    expect(screen.getAllByRole('listitem')).toHaveLength(7);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Encerrar programa' })); });
    expect(h.updateProfile).toHaveBeenCalledWith({ runGoal: null, runStart: null });
  });
});

describe('RunFeedPage (aba Início)', () => {
  const friendRun = {
    id: 'r1', name: 'Bia', isMe: false, started_at: new Date().toISOString(), run_date: '2026-11-05',
    duration_s: 1800, distance_m: 5000, route: [], kind: 'livre', title: 'Corrida da manhã', visibility: 'amigos', kudos: 0, kudoed: false,
  };

  it('mostra a corrida do amigo e aplaude', async () => {
    h.fetchRunFeed.mockResolvedValueOnce([friendRun]);
    render(<RunFeedPage />);
    expect(await screen.findByText('Corrida da manhã')).toBeTruthy();
    expect(screen.getByText('5,00 km')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Aplaudir a corrida de Bia' })); });
    expect(h.toggleKudos).toHaveBeenCalledWith('r1');
    expect(screen.getByRole('button', { name: 'Tirar aplauso' }).textContent).toContain('1');
  });

  it('sem corridas convida a gravar e a chamar amigos', async () => {
    render(<RunFeedPage />);
    expect(await screen.findByText(/Nenhuma corrida ainda/)).toBeTruthy();
    expect(screen.getByText(/Corra com os amigos/)).toBeTruthy();
  });

  it('a própria corrida não tem botão de aplaudir', async () => {
    h.fetchRunFeed.mockResolvedValueOnce([{ ...friendRun, isMe: true, kudos: 3 }]);
    render(<RunFeedPage />);
    expect(await screen.findByText('👏 3')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Aplaudir/ })).toBeNull();
  });
});

describe('RunChallengesPage (aba Desafios)', () => {
  it('mostra os desafios do mês, o ranking e os amigos', async () => {
    h.fetchFriendsWeek.mockResolvedValueOnce([
      { name: 'Bia', isMe: false, meters: 12000, runs: 2, rank: 1 },
      { name: 'Ana', isMe: true, meters: 8000, runs: 1, rank: 2 },
    ]);
    render(<RunChallengesPage />);
    expect(await screen.findByText('Km da semana entre amigos')).toBeTruthy();
    expect(screen.getByText(/🥇 Bia/)).toBeTruthy();
    expect(screen.getByText(/Corra 25 km no mês/)).toBeTruthy();
    expect(await screen.findByText('ANA7K2')).toBeTruthy();
  });
});
