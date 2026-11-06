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
  shoes: [],
  comments: [],
  addRunComment: vi.fn(async (runId, body) => ({ id: 9, name: 'Ana', isMe: true, body, created_at: new Date().toISOString(), canDelete: true })),
  deleteRunComment: vi.fn(async () => {}),
  reportRunComment: vi.fn(async () => {}),
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
  fetchShoes: async () => h.shoes,
  fetchRunComments: async () => h.comments,
  addRunComment: (...a) => h.addRunComment(...a),
  deleteRunComment: (...a) => h.deleteRunComment(...a),
  reportRunComment: (...a) => h.reportRunComment(...a),
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
  h.shoes = [];
  h.comments = [];
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

  it('o fim da corrida sugere o único tênis ativo e salva com ele', async () => {
    h.shoes = [{ id: 's1', name: 'Azul', initial_m: 0, limit_m: 700000, retired: false }, { id: 's2', name: 'Velho', initial_m: 0, limit_m: 700000, retired: true }];
    act(() => { setLiveRun(startRun({ gps: false }, Date.now() - 60_000)); });
    render(<LiveRunHost />);
    fireEvent.click(screen.getByRole('button', { name: /Finalizar/ }));
    const azul = await screen.findByRole('button', { name: /Azul/ });
    await waitFor(() => expect(azul.getAttribute('aria-pressed')).toBe('true'));
    expect(screen.queryByRole('button', { name: /Velho/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('Distância (km)'), { target: { value: '3' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar corrida' })); });
    await waitFor(() => expect(h.saveRun).toHaveBeenCalled());
    expect(h.saveRun.mock.calls[0][1]).toMatchObject({ shoe_id: 's1', distance_m: 3000 });
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

describe('LiveRunHost: app fechado no meio da corrida', () => {
  it('pergunta e, ao parar, corta o tempo em que o app ficou fechado', () => {
    const now = Date.now();
    act(() => { setLiveRun({ ...startRun({}, now - 3_600_000), updatedAt: now - 3_600_000 }); });
    localStorage.setItem('eafit_live_run_seen', JSON.stringify({ id: getLiveRun().id, at: now - 1_800_000 }));
    render(<LiveRunHost />);
    expect(screen.getByRole('dialog', { name: 'Corrida interrompida' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Parar a corrida quando o app fechou/ }));
    const run = getLiveRun();
    expect(run.segmentStart).toBeNull();
    expect(Math.round(run.activeMs / 60000)).toBe(30);
    expect(screen.getByRole('dialog', { name: 'Corrida em andamento' })).toBeTruthy();
  });

  it('continuar mantém o tempo contando', () => {
    const now = Date.now();
    act(() => { setLiveRun({ ...startRun({}, now - 3_600_000), updatedAt: now - 3_600_000 }); });
    render(<LiveRunHost />);
    fireEvent.click(screen.getByRole('button', { name: /Continuei correndo/ }));
    expect(getLiveRun().segmentStart).not.toBeNull();
  });
});

describe('Treino guiado', () => {
  it('monta um intervalado na aba Gravar e começa a corrida com ele', () => {
    render(<RunHomePage />);
    fireEvent.click(screen.getByRole('button', { name: /Treino guiado: intervalado/ }));
    fireEvent.change(screen.getByLabelText('Repetições'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Ritmo dos tiros (opcional)'), { target: { value: '4:45' } });
    expect(screen.getByText('8x 400 m forte / 200 m trote · alvo 4:45/km')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Começar treino/ }));
    expect(getLiveRun().session).toMatchObject({ type: 'intervalado', custom: { reps: 8, targetPace: 285 } });
  });

  it('ritmo alvo inválido não começa', () => {
    render(<RunHomePage />);
    fireEvent.click(screen.getByRole('button', { name: /Treino guiado: intervalado/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Ritmo alvo' }));
    fireEvent.change(screen.getByLabelText('Ritmo alvo (min/km)'), { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: /Começar treino/ }));
    expect(getLiveRun()).toBeNull();
    expect(h.toast).toHaveBeenCalledWith(expect.stringMatching(/5:30/));
  });

  it('a corrida ao vivo mostra a etapa, avança e deixa pular', () => {
    const session = { type: 'intervalado', custom: { warmupMin: 1, reps: 2, work: { unit: 'm', value: 400 }, rest: { unit: 's', value: 60 }, cooldownMin: 0 } };
    act(() => { setLiveRun(startRun({ gps: true, session }, Date.now() - 5_000)); });
    render(<LiveRunHost />);
    expect(screen.getByText('Aquecimento')).toBeTruthy();
    expect(getLiveRun().workoutPos).toEqual({ index: 0, startS: 0, startM: 0 });
    fireEvent.click(screen.getByRole('button', { name: /Pular etapa/ }));
    expect(screen.getByText('Forte · 1 de 2')).toBeTruthy();
    expect(screen.getByText('400 m')).toBeTruthy();
    expect(screen.getByText('Depois: Trote 1 min')).toBeTruthy();
    act(() => { setLiveRun(setDistance(getLiveRun(), 450)); });
    expect(screen.getByText('Trote · 1 de 2')).toBeTruthy();
  });

  it('corrida com ritmo alvo mostra o alvo', () => {
    act(() => { setLiveRun(startRun({ gps: true, session: { type: 'livre', targetPace: 330 } }, Date.now() - 5_000)); });
    render(<LiveRunHost />);
    expect(screen.getByText('Ritmo alvo 5:30/km')).toBeTruthy();
    expect(screen.getByText('Alvo 5:30/km')).toBeTruthy();
    expect(screen.getByText('medindo…')).toBeTruthy();
  });
});

describe('RunHomePage (aba Gravar)', () => {
  it('lança uma corrida de esteira sem gravar', async () => {
    render(<RunHomePage />);
    fireEvent.click(screen.getByRole('button', { name: /Lançar corrida feita sem o app/ }));
    fireEvent.change(screen.getByLabelText('Distância (km)'), { target: { value: '4,5' } });
    fireEvent.change(screen.getByLabelText('min'), { target: { value: '30' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar corrida' })); });
    await waitFor(() => expect(h.saveRun).toHaveBeenCalled());
    expect(h.saveRun.mock.calls[0][1]).toMatchObject({ distance_m: 4500, duration_s: 1800, gps: false, title: 'Corrida na esteira' });
    expect(screen.queryByRole('form', { name: 'Lançar corrida' })).toBeNull();
  });

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

  it('abre os comentários, comenta e denuncia o de outra pessoa', async () => {
    h.fetchRunFeed.mockResolvedValueOnce([{ ...friendRun, comments: 1 }]);
    h.comments = [{ id: 1, name: 'Caio', isMe: false, body: 'Bora!', created_at: new Date().toISOString(), canDelete: false }];
    render(<RunFeedPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Comentários (1)' }));
    expect(await screen.findByText('Bora!')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Apagar' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Escrever comentário'), { target: { value: 'Mandou bem' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Enviar' })); });
    expect(h.addRunComment).toHaveBeenCalledWith('r1', 'Mandou bem');
    expect(screen.getByText('Mandou bem')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Comentários (2)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Denunciar' }));
    expect(h.reportRunComment).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Toque de novo para denunciar' })); });
    expect(h.reportRunComment).toHaveBeenCalledWith(1);
  });

  it('mostra o resumo da semana passada', async () => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 3);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    h.fetchRuns.mockResolvedValue([{ client_id: 'x', run_date: date, distance_m: 8000, duration_s: 2700, splits: [], route: [] }]);
    render(<RunFeedPage />);
    expect(await screen.findByText('Sua semana passada')).toBeTruthy();
    expect(screen.getByText('8,0 km em 1 corrida(s)')).toBeTruthy();
    h.fetchRuns.mockResolvedValue([]);
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
