// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor, within } from '@testing-library/react';

const h = vi.hoisted(() => ({
  user: { id: 'u1', user_metadata: {} },
  updateProfile: vi.fn(async () => ({ error: null })),
  toast: vi.fn(),
  saveRun: vi.fn(async (uid, run) => ({ run, pending: false })),
  fetchRuns: vi.fn(async () => []),
  fetchRunFeed: vi.fn(async () => []),
  deleteRun: vi.fn(async () => {}),
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
vi.mock('../../lib/appNav', () => ({ goTo: vi.fn() }));
vi.mock('./runShareCard', () => ({ renderRunCard: vi.fn(async () => 'blob'), shareRunCard: vi.fn(async () => 'shared'), renderRunSummaryCard: vi.fn(async () => 'blob'), shareRunSummary: vi.fn(async () => 'shared') }));
vi.mock('./runs', async (orig) => ({
  ...(await orig()),
  saveRun: (...a) => h.saveRun(...a),
  fetchRuns: (...a) => h.fetchRuns(...a),
  fetchRunFeed: (...a) => h.fetchRunFeed(...a),
  deleteRun: (...a) => h.deleteRun(...a),
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
import RunHistoryPage from './RunHistoryPage';
import RunFeedPage from './RunFeedPage';
import { shareRunCard, shareRunSummary } from './runShareCard';
import { todayDate } from '../../data/treinoData';
import RunChallengesPage from './RunChallengesPage';
import { speak } from '../../lib/voice';
import { programFromMetadata, programToday, isRunSession, sessionTitle } from './program';
import { goTo } from '../../lib/appNav';
import { setLiveRun, startRun, setDistance, getLiveRun, resetLiveRunCache, addRoutePoint, markRunSeen } from './liveRun';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetLiveRunCache();
  h.user = { id: 'u1', user_metadata: {} };
  h.shoes = [];
  h.comments = [];
  // Nenhum teste fala com o Open-Meteo de verdade.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); act(() => { setLiveRun(null); }); });

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

describe('LiveRunHost: bateria', () => {
  const battery = (level, charging = false) => {
    const ls = {};
    const b = {
      level, charging,
      addEventListener: (ev, fn) => { (ls[ev] ||= []).push(fn); },
      removeEventListener: () => {},
      set: (next, isCharging = false) => { b.level = next; b.charging = isCharging; (ls.levelchange || []).forEach(f => f()); (ls.chargingchange || []).forEach(f => f()); },
    };
    return b;
  };
  afterEach(() => { delete navigator.getBattery; });

  it('bateria em 15% mostra o aviso com o botão da tela escura, vibra e fala', async () => {
    navigator.getBattery = vi.fn().mockResolvedValue(battery(0.15));
    navigator.vibrate = vi.fn();
    act(() => { setLiveRun(startRun({ gps: false, session: null })); });
    render(<LiveRunHost />);
    const alert = await screen.findByText(/Bateria em 15%/);
    expect(alert.closest('[role="alert"]').textContent).toContain('Tela escura');
    // vibração e voz saem no efeito, logo depois de o aviso aparecer
    await waitFor(() => expect(navigator.vibrate).toHaveBeenCalledWith([400, 120, 400]));
    await waitFor(() => expect(speak).toHaveBeenCalledWith('Bateria em 15 por cento.', { queue: true }));
    delete navigator.vibrate;
  });

  it('bateria boa, carregando ou sem suporte do navegador não mostra aviso', async () => {
    act(() => { setLiveRun(startRun({ gps: false, session: null })); });
    navigator.getBattery = vi.fn().mockResolvedValue(battery(0.8));
    const a = render(<LiveRunHost />);
    await act(async () => {});
    expect(screen.queryByText(/Bateria em/)).toBeNull();
    a.unmount();
    navigator.getBattery = vi.fn().mockResolvedValue(battery(0.05, true));
    const b = render(<LiveRunHost />);
    await act(async () => {});
    expect(screen.queryByText(/Bateria em/)).toBeNull();
    b.unmount();
    delete navigator.getBattery;
    render(<LiveRunHost />);
    await act(async () => {});
    expect(screen.queryByText(/Bateria em/)).toBeNull();
  });

  it('cair para 10% avisa de novo em tom crítico, e carregar tira o aviso', async () => {
    const b = battery(0.18);
    navigator.getBattery = vi.fn().mockResolvedValue(b);
    act(() => { setLiveRun(startRun({ gps: false, session: null })); });
    render(<LiveRunHost />);
    await screen.findByText(/Bateria em 18%/);
    act(() => b.set(0.09));
    expect(await screen.findByText(/finalize logo/)).toBeTruthy();
    await waitFor(() => expect(speak).toHaveBeenCalledWith('Bateria em 9 por cento. Finalize logo a corrida.', { queue: true }));
    act(() => b.set(0.09, true));
    expect(screen.queryByText(/Bateria em/)).toBeNull();
  });
});

describe('LiveRunHost: lembrete de corrida longa (sem leitura de bateria)', () => {
  // Corrida que já tem `secs` s corridos e o app aberto agora (senão viraria "corrida interrompida").
  const runningFor = secs => { const r = startRun({ gps: false, session: null }, Date.now() - secs * 1000); markRunSeen(r); return { ...r, updatedAt: Date.now() }; };
  const tick = seconds => { for (let i = 0; i < seconds; i++) act(() => { vi.advanceTimersByTime(1000); }); };
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); delete navigator.getBattery; delete navigator.vibrate; });

  it('aos 45 min lembra da tela escura, vibra, fala e some sozinho', () => {
    navigator.vibrate = vi.fn();
    act(() => { setLiveRun(runningFor(45 * 60 - 2)); });
    render(<LiveRunHost />);
    expect(screen.queryByText(/Corrida longa/)).toBeNull(); // ainda faltam 2 s
    tick(3);
    expect(screen.getByText('⏱️ Corrida longa: se a bateria estiver baixa, use a tela escura.')).toBeTruthy();
    expect(navigator.vibrate).toHaveBeenCalledWith([400, 120, 400]);
    expect(speak).toHaveBeenCalledWith('Corrida longa. Se a bateria estiver baixa, use a tela escura.', { queue: true });
    act(() => { vi.advanceTimersByTime(21000); });
    expect(screen.queryByText(/Corrida longa/)).toBeNull();
  });

  it('"Entendi" dispensa na hora', () => {
    act(() => { setLiveRun(runningFor(45 * 60 - 1)); });
    render(<LiveRunHost />);
    tick(2);
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    expect(screen.queryByText(/Corrida longa/)).toBeNull();
  });

  it('corrida já passada dos 45 min ao abrir não avisa de imediato', () => {
    act(() => { setLiveRun(runningFor(50 * 60)); });
    render(<LiveRunHost />);
    tick(3);
    expect(screen.queryByText(/Corrida longa/)).toBeNull();
  });

  it('onde o navegador lê a bateria (Android) não mostra o lembrete', () => {
    navigator.getBattery = vi.fn().mockResolvedValue({ level: 0.9, charging: false, addEventListener: () => {}, removeEventListener: () => {} });
    act(() => { setLiveRun(runningFor(45 * 60 - 1)); });
    render(<LiveRunHost />);
    tick(3);
    expect(screen.queryByText(/Corrida longa/)).toBeNull();
  });
});

describe('LiveRunHost: clima', () => {
  it('mostra o clima de onde a corrida começou, com vento e umidade', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ current: { temperature_2m: 24, weather_code: 0, wind_speed_10m: 12, relative_humidity_2m: 60 } }) }));
    act(() => { setLiveRun(addRoutePoint(startRun({ gps: true, session: null }), -23.5, -46.6)); });
    render(<LiveRunHost />);
    expect(await screen.findByText('☀️ 24°C')).toBeTruthy();
    expect(screen.getByText('vento 12 km/h · umidade 60%')).toBeTruthy();
  });

  it('o resumo da corrida também mostra o clima', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ current: { temperature_2m: 19, weather_code: 61, wind_speed_10m: 8, relative_humidity_2m: 85 } }) }));
    act(() => { setLiveRun(addRoutePoint(startRun({ gps: true, session: null }), -23.5, -46.6)); });
    render(<LiveRunHost />);
    await screen.findByText('🌧️ 19°C'); // tela ao vivo
    fireEvent.click(screen.getByRole('button', { name: /Finalizar/ }));
    expect(screen.getByRole('dialog', { name: 'Finalizar corrida' })).toBeTruthy();
    expect(await screen.findByText('🌧️ 19°C')).toBeTruthy();
    expect(screen.getByText('vento 8 km/h · umidade 85%')).toBeTruthy();
  });

  it('compartilhar só existe depois de salvar: a tela "Corrida salva" manda o cartão com título e clima', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ current: { temperature_2m: 19, weather_code: 61 } }) }));
    act(() => { setLiveRun(addRoutePoint(startRun({ gps: true, session: null }), -23.5, -46.6)); });
    render(<LiveRunHost />);
    await screen.findByText('🌧️ 19°C');
    fireEvent.click(screen.getByRole('button', { name: /Finalizar/ }));
    // Antes de salvar não há botão de compartilhar.
    expect(screen.queryByRole('button', { name: /Compartilhar/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Treino do parque' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar corrida' })); });
    await waitFor(() => expect(h.saveRun).toHaveBeenCalled());

    // A corrida em andamento acabou, mas a tela de confirmação segue com o compartilhar.
    expect(getLiveRun()).toBeNull();
    const dialog = await screen.findByRole('dialog', { name: 'Corrida salva' });
    expect(within(dialog).getByText(/🌧️ 19°C/)).toBeTruthy();
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: '📤 Compartilhar' })); });
    expect(shareRunCard).toHaveBeenCalledTimes(1);
    expect(shareRunCard.mock.calls[0][0]).toMatchObject({ title: 'Treino do parque', weather: { t: 19, c: 61 }, gps: true });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Concluir' }));
    expect(screen.queryByRole('dialog', { name: 'Corrida salva' })).toBeNull();
  });

  it('se a consulta de clima ao salvar falhar, a corrida salva fica com o clima que a tela já mostrava', async () => {
    let calls = 0;
    // As telas ao vivo e de resumo buscam o clima (2 consultas); a de salvar falha.
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      if (calls > 2) throw new Error('sem rede');
      return { ok: true, json: async () => ({ current: { temperature_2m: 22, weather_code: 0 } }) };
    }));
    act(() => { setLiveRun(addRoutePoint(startRun({ gps: true, session: null }), -23.5, -46.6)); });
    render(<LiveRunHost />);
    await screen.findByText('☀️ 22°C');
    fireEvent.click(screen.getByRole('button', { name: /Finalizar/ }));
    await screen.findByText('☀️ 22°C');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar corrida' })); });
    await waitFor(() => expect(h.saveRun).toHaveBeenCalled());
    expect(h.saveRun.mock.calls[0][1].weather).toEqual({ t: 22, w: null, h: null, c: 0 });
    const dialog = await screen.findByRole('dialog', { name: 'Corrida salva' });
    expect(within(dialog).getByText(/☀️ 22°C/)).toBeTruthy();
  });

  it('descartar a corrida não abre a tela "Corrida salva"', async () => {
    act(() => { setLiveRun(startRun({ gps: false, session: null })); });
    render(<LiveRunHost />);
    fireEvent.click(screen.getByRole('button', { name: /Finalizar/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Descartar corrida' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toque de novo para descartar' }));
    expect(getLiveRun()).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Corrida salva' })).toBeNull();
  });

  it('sem GPS ou sem internet não mostra clima', async () => {
    act(() => { setLiveRun(startRun({ gps: false, session: null })); });
    render(<LiveRunHost />);
    await act(async () => {});
    expect(document.querySelector('.run-live__weather')).toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: 'Começar já' }));
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

describe('correr de novo (fantasma)', () => {
  const loop = (lat, lon) => [[[lat, lon], [lat + 300, lon], [lat + 300, lon + 300], [lat, lon + 300]]];
  const past = (client_id, duration_s, lat) => ({
    client_id, title: client_id === 'slow' ? 'Parque lento' : 'Parque rápido', run_date: '2026-10-01', started_at: '2026-10-01T10:00:00.000Z',
    duration_s, distance_m: 5000, splits: [duration_s / 5, duration_s / 5, duration_s / 5, duration_s / 5, duration_s / 5],
    route: loop(lat, -4000000), kind: 'livre', visibility: 'amigos', gps: true, intervals: [],
  });

  it('a corrida ao vivo mostra quanto falta para o fantasma e mede nos primeiros 100 m', () => {
    const ghost = { id: 'a', title: 'Parque', date: '2026-10-01', duration_s: 1500, distance_m: 5000, splits: [300, 300, 300, 300, 300] };
    act(() => { setLiveRun(startRun({ gps: true, ghost }, Date.now() - 5_000)); });
    render(<LiveRunHost />);
    expect(screen.getByText(/👻 Parque/)).toBeTruthy();
    expect(screen.getByText('medindo…')).toBeTruthy();
    act(() => { setLiveRun(setDistance(getLiveRun(), 1000)); });
    expect(screen.getByText(/à frente/)).toBeTruthy();
  });

  it('no histórico: correr de novo contra esta ou contra a melhor da mesma rota', async () => {
    h.fetchRuns.mockResolvedValue([past('slow', 1800, -2300000), past('fast', 1500, -2300050)]);
    render(<RunHistoryPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Parque lento/ }));
    expect(screen.getByRole('button', { name: /Correr contra a minha melhor nessa rota \(25:00/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Correr contra a minha melhor/ }));
    expect(getLiveRun().ghost).toMatchObject({ id: 'fast', duration_s: 1500 });
  });

  it('no histórico: a linha da corrida já mostra o clima, sem abrir', async () => {
    h.fetchRuns.mockResolvedValue([{ ...past('slow', 1800, -2300000), weather: { t: 24, w: 12, h: 60, c: 0 } }, past('fast', 1500, -2300050)]);
    render(<RunHistoryPage />);
    await screen.findByRole('button', { name: /Parque lento/ });
    expect(screen.getAllByText('☀️ 24°C')).toHaveLength(1); // só a corrida que tem clima
  });

  it('no histórico: filtra a lista por tipo e por período, e limpa os filtros', async () => {
    const mk = (id, kind, run_date) => ({ ...past(id, 1800, -2300000), client_id: id, title: `Volta ${id}`, kind, run_date });
    h.fetchRuns.mockResolvedValue([mk('a', 'longao', todayDate()), mk('b', 'livre', '2020-01-01')]);
    render(<RunHistoryPage />);
    await screen.findByRole('button', { name: /Volta a/ });
    expect(screen.getAllByRole('button', { name: /^.*Volta / })).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: '30 dias' }));
    expect(screen.queryByRole('button', { name: /Volta b/ })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('1 de 2 corridas');

    fireEvent.click(screen.getByRole('button', { name: 'Corrida livre' })); // tipo que só existe fora do período
    expect(screen.getByText('Nenhuma corrida com esses filtros.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(screen.getByRole('button', { name: /Volta a/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Volta b/ })).toBeTruthy();
  });

  it('no histórico: os filtros escolhidos voltam na próxima visita', async () => {
    h.fetchRuns.mockResolvedValue([past('slow', 1800, -2300000), past('fast', 1500, -2300050)]);
    const first = render(<RunHistoryPage />);
    await screen.findByRole('button', { name: /Parque lento/ });
    fireEvent.click(screen.getByRole('button', { name: '90 dias' }));
    first.unmount();
    render(<RunHistoryPage />);
    await screen.findByRole('button', { name: /Parque lento/ });
    expect(screen.getByRole('button', { name: '90 dias' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('na aba Você: "Clima e ritmo do mês" compara o ritmo por faixa só com as corridas do mês', async () => {
    const mk = (id, t, dur, run_date = todayDate()) => ({ ...past(id, dur, -2300000), client_id: id, run_date, weather: { t, c: 0 } });
    h.fetchRuns.mockResolvedValue([
      mk('a', 12, 1800), mk('b', 20, 1700), mk('c', 22, 1700), mk('d', 31, 2100),
      mk('old1', 5, 1500, '2020-01-01'), mk('old2', 5, 1500, '2020-01-02'), // de outro mês: não entram
    ]);
    render(<RunHistoryPage />);
    await screen.findByText('Clima e ritmo do mês');
    expect(screen.getByText(/4 corridas com clima neste mês · média de 21°C/)).toBeTruthy();
    expect(document.querySelectorAll('.run-wx__row')).toHaveLength(3);
    expect(document.querySelector('.run-wx__row--best').textContent).toContain('Ameno');
  });

  it('na aba Você: com 1 corrida com clima no mês o bloco já aparece, sem apontar a mais rápida', async () => {
    h.fetchRuns.mockResolvedValue([{ ...past('a', 1800, -2300000), run_date: todayDate(), weather: { t: 24, c: 0 } }]);
    render(<RunHistoryPage />);
    await screen.findByText('Clima e ritmo do mês');
    expect(screen.getByText('1 corrida com clima neste mês · 24°C')).toBeTruthy();
    expect(document.querySelectorAll('.run-wx__row')).toHaveLength(1);
    expect(document.querySelector('.run-wx__row--best')).toBeNull();
    expect(screen.getByText(/Com mais corridas em faixas diferentes/)).toBeTruthy();
  });

  it('apagar corrida some na hora, dá para desfazer e só vai ao servidor depois de 6 s', async () => {
    h.fetchRuns.mockResolvedValue([past('slow', 1800, -2300000), past('fast', 1500, -2300050)]);
    render(<RunHistoryPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Parque lento/ }));
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Apagar corrida' })); // um toque só: sem confirmação
      expect(screen.queryByRole('button', { name: /Parque lento/ })).toBeNull();
      expect(h.deleteRun).not.toHaveBeenCalled();
      const [msg, ms, opts] = h.toast.mock.calls.at(-1);
      expect(msg).toBe('Corrida apagada');
      expect(ms).toBe(6000);

      act(() => { opts.action.onClick(); }); // Desfazer
      expect(screen.getByRole('button', { name: /Parque lento/ })).toBeTruthy();
      await act(async () => { vi.advanceTimersByTime(7000); });
      expect(h.deleteRun).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('apagar sem desfazer: depois de 6 s a exclusão vai ao servidor', async () => {
    h.fetchRuns.mockResolvedValue([past('slow', 1800, -2300000), past('fast', 1500, -2300050)]);
    render(<RunHistoryPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Parque lento/ }));
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Apagar corrida' }));
      await act(async () => { vi.advanceTimersByTime(6100); });
      expect(h.deleteRun).toHaveBeenCalledTimes(1);
      expect(h.deleteRun.mock.calls[0][1]).toMatchObject({ client_id: 'slow' });
      expect(screen.queryByRole('button', { name: /Parque lento/ })).toBeNull();
      expect(screen.getByRole('button', { name: /Parque rápido/ })).toBeTruthy();
    } finally { vi.useRealTimers(); }
  });

  it('a corrida mais rápida da rota não oferece "melhor": só contra ela mesma', async () => {
    h.fetchRuns.mockResolvedValue([past('slow', 1800, -2300000), past('fast', 1500, -2300050)]);
    render(<RunHistoryPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Parque rápido/ }));
    expect(screen.queryByRole('button', { name: /minha melhor/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Correr de novo contra esta \(25:00\)/ }));
    expect(getLiveRun().ghost).toMatchObject({ id: 'fast' });
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
    expect(getLiveRun()).toBeNull(); // antes, a contagem 3-2-1
    fireEvent.click(screen.getByRole('button', { name: 'Começar já' }));
    expect(getLiveRun()).toMatchObject({ session: null });
  });

  it('a contagem 3-2-1 começa a corrida sozinha ao chegar no zero', () => {
    vi.useFakeTimers();
    try {
      render(<RunHomePage />);
      fireEvent.click(screen.getByRole('button', { name: 'Começar corrida' }));
      expect(screen.getByText('3')).toBeTruthy();
      for (let i = 0; i < 2; i++) act(() => { vi.advanceTimersByTime(1000); }); // um passo por vez: cada número arma o próximo
      expect(screen.getByText('1')).toBeTruthy();
      expect(getLiveRun()).toBeNull();
      act(() => { vi.advanceTimersByTime(1000); });
      expect(getLiveRun()).toMatchObject({ session: null });
    } finally { vi.useRealTimers(); }
  });

  it('cancelar a contagem não inicia a corrida', () => {
    render(<RunHomePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Começar corrida' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(getLiveRun()).toBeNull();
  });

  it('sem leitura de bateria (iPhone) lembra de conferir a bateria e some com "Entendi" para sempre', () => {
    const first = render(<RunHomePage />);
    expect(screen.getByText(/Confira a bateria antes de sair/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    expect(screen.queryByText(/Confira a bateria antes de sair/)).toBeNull();
    first.unmount();
    render(<RunHomePage />); // próxima visita
    expect(screen.queryByText(/Confira a bateria antes de sair/)).toBeNull();
  });

  it('onde o navegador lê a bateria (Chrome no Android) não mostra a dica, pois o aviso é real', () => {
    navigator.getBattery = vi.fn().mockResolvedValue({ level: 1, charging: false, addEventListener: () => {}, removeEventListener: () => {} });
    try {
      render(<RunHomePage />);
      expect(screen.queryByText(/Confira a bateria antes de sair/)).toBeNull();
    } finally { delete navigator.getBattery; }
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
    expect(document.querySelectorAll('.run-week__day')).toHaveLength(7);
    fireEvent.click(screen.getByRole('button', { name: /Ver o programa completo/ }));
    expect(document.querySelectorAll('.run-calendar__week')).toHaveLength(8);
    expect(document.querySelectorAll('.run-calendar__week--now')).toHaveLength(1);
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

  it('o cartão da corrida mostra o clima de quando ela começou, quando tem', async () => {
    h.fetchRunFeed.mockResolvedValueOnce([
      { ...friendRun, weather: { t: 24, w: 12, h: 60, c: 0 } },
      { ...friendRun, id: 'r2', title: 'Sem clima' },
    ]);
    render(<RunFeedPage />);
    await screen.findByText('Corrida da manhã');
    expect(screen.getAllByText('☀️ 24°C · Céu limpo · vento 12 km/h · umidade 60%')).toHaveLength(1);
  });

  it('só as corridas da própria pessoa têm o botão de compartilhar, e ele manda o cartão', async () => {
    const mine = { ...friendRun, id: 'm1', name: 'Eu', isMe: true, title: 'Minha volta', weather: { t: 24, c: 0 } };
    h.fetchRunFeed.mockResolvedValueOnce([friendRun, mine]);
    render(<RunFeedPage />);
    await screen.findByText('Minha volta');
    const buttons = screen.getAllByRole('button', { name: 'Compartilhar a corrida' });
    expect(buttons).toHaveLength(1); // a do amigo não tem
    await act(async () => { fireEvent.click(buttons[0]); });
    expect(shareRunCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'm1', weather: { t: 24, c: 0 } }), expect.anything());
  });

  it('com corridas no feed o botão rápido começa a corrida livre depois da contagem 3-2-1', async () => {
    h.fetchRunFeed.mockResolvedValueOnce([friendRun]);
    render(<RunFeedPage />);
    await screen.findByText('Corrida da manhã');
    fireEvent.click(screen.getByRole('button', { name: '▶ Começar corrida' }));
    expect(getLiveRun()).toBeNull(); // antes, a contagem
    expect(screen.getByRole('dialog', { name: 'Contagem para começar a corrida' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Começar já' }));
    expect(getLiveRun()).toMatchObject({ session: null });
    expect(goTo).not.toHaveBeenCalled(); // não passa pela aba Gravar
  });

  it('o botão rápido usa o GPS como a pessoa deixou na aba Gravar', async () => {
    localStorage.setItem('eafit_run_gps', 'off');
    h.fetchRunFeed.mockResolvedValueOnce([friendRun]);
    render(<RunFeedPage />);
    await screen.findByText('Corrida da manhã');
    fireEvent.click(screen.getByRole('button', { name: '▶ Começar corrida' }));
    fireEvent.click(screen.getByRole('button', { name: 'Começar já' }));
    expect(getLiveRun().gps).toBe(false);
  });

  it('o botão rápido mostra o clima do lugar onde a última corrida começou', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ current: { temperature_2m: 26, weather_code: 0 } }) });
    vi.stubGlobal('fetch', fetcher);
    h.fetchRuns.mockResolvedValue([{ client_id: 'x', run_date: '2026-10-01', started_at: '2026-10-01T10:00:00.000Z', duration_s: 1800, distance_m: 5000, splits: [], kind: 'livre', route: [[[-2350000, -4660000, 0], [-2350050, -4659950, 60]]] }]);
    h.fetchRunFeed.mockResolvedValueOnce([friendRun]);
    render(<RunFeedPage />);
    const btn = await screen.findByRole('button', { name: /▶ Começar corrida/ });
    expect(await within(btn).findByText('☀️ 26°C')).toBeTruthy();
    expect(fetcher.mock.calls[0][0]).toContain('latitude=-23.5&longitude=-46.6');
  });

  it('sem corrida anterior com percurso o botão fica sem clima, sem pedir o clima', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    h.fetchRuns.mockResolvedValue([]);
    h.fetchRunFeed.mockResolvedValueOnce([friendRun]);
    render(<RunFeedPage />);
    const btn = await screen.findByRole('button', { name: '▶ Começar corrida' });
    await act(async () => {});
    expect(btn.textContent).toBe('▶ Começar corrida');
    expect(fetcher).not.toHaveBeenCalled();
  });

  describe('botão rápido com programa', () => {
    // Um dia da semana de 02/11/2026 em que o programa manda correr (e outro de descanso, se houver).
    const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
    const md = { runGoal: '5k', runNivel: 'intermediario', runStart: '2026-11-02' };
    const sessionOn = day => {
      const prog = programFromMetadata(md);
      const w = programToday(prog, day);
      return w.days[w.dayIndex];
    };
    const runDay = days.find(d => isRunSession(sessionOn(d)));
    const restDay = days.find(d => !isRunSession(sessionOn(d)));

    afterEach(() => { vi.useRealTimers(); });

    it('com treino marcado para hoje o botão mostra o treino e começa com ele', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(`${runDay}T15:00:00Z`));
      h.user = { id: 'u1', user_metadata: md };
      h.fetchRunFeed.mockResolvedValueOnce([friendRun]);
      render(<RunFeedPage />);
      const title = sessionTitle(sessionOn(runDay));
      const btn = await screen.findByRole('button', { name: `▶ Começar: ${title}` });
      fireEvent.click(btn);
      fireEvent.click(screen.getByRole('button', { name: 'Começar já' }));
      expect(getLiveRun().session).toMatchObject({ type: sessionOn(runDay).type, week: 1 });
    });

    it('com treino marcado ainda dá para fazer uma corrida livre', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(`${runDay}T15:00:00Z`));
      h.user = { id: 'u1', user_metadata: md };
      h.fetchRunFeed.mockResolvedValueOnce([friendRun]);
      render(<RunFeedPage />);
      await screen.findByRole('button', { name: /▶ Começar: / });
      fireEvent.click(screen.getByRole('button', { name: 'Fazer corrida livre' }));
      fireEvent.click(screen.getByRole('button', { name: 'Começar já' }));
      expect(getLiveRun().session).toBeNull();
    });

    it('em dia de descanso do programa o botão segue como corrida livre', async () => {
      if (!restDay) return; // programa sem descanso na semana: nada a verificar
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(`${restDay}T15:00:00Z`));
      h.user = { id: 'u1', user_metadata: md };
      h.fetchRunFeed.mockResolvedValueOnce([friendRun]);
      render(<RunFeedPage />);
      await screen.findByRole('button', { name: '▶ Começar corrida' });
      expect(screen.queryByRole('button', { name: 'Fazer corrida livre' })).toBeNull();
    });
  });

  describe('GPS durante a contagem do botão rápido', () => {
    let watch;
    beforeEach(() => {
      watch = { watchPosition: vi.fn(() => 5), clearWatch: vi.fn() };
      Object.defineProperty(navigator, 'geolocation', { configurable: true, value: watch });
    });
    afterEach(() => { delete navigator.geolocation; });

    it('começa a procurar o sinal ao tocar e mostra o estado na contagem', async () => {
      h.fetchRunFeed.mockResolvedValueOnce([friendRun]);
      render(<RunFeedPage />);
      await screen.findByText('Corrida da manhã');
      expect(watch.watchPosition).not.toHaveBeenCalled(); // só na contagem: ficar na tela não liga o GPS
      fireEvent.click(screen.getByRole('button', { name: '▶ Começar corrida' }));
      expect(watch.watchPosition).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Procurando GPS/)).toBeTruthy();
    });

    it('cancelar a contagem solta o GPS', async () => {
      h.fetchRunFeed.mockResolvedValueOnce([friendRun]);
      render(<RunFeedPage />);
      await screen.findByText('Corrida da manhã');
      fireEvent.click(screen.getByRole('button', { name: '▶ Começar corrida' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
      expect(watch.clearWatch).toHaveBeenCalledWith(5);
    });

    it('com o GPS desligado na aba Gravar a contagem não liga o GPS', async () => {
      localStorage.setItem('eafit_run_gps', 'off');
      h.fetchRunFeed.mockResolvedValueOnce([friendRun]);
      render(<RunFeedPage />);
      await screen.findByText('Corrida da manhã');
      fireEvent.click(screen.getByRole('button', { name: '▶ Começar corrida' }));
      expect(watch.watchPosition).not.toHaveBeenCalled();
      expect(screen.queryByText(/Procurando GPS/)).toBeNull();
    });
  });

  it('cancelar a contagem do botão rápido não inicia nada', async () => {
    h.fetchRunFeed.mockResolvedValueOnce([friendRun]);
    render(<RunFeedPage />);
    await screen.findByText('Corrida da manhã');
    fireEvent.click(screen.getByRole('button', { name: '▶ Começar corrida' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(getLiveRun()).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Contagem para começar a corrida' })).toBeNull();
  });

  it('sem corridas só há um botão de gravar (o do estado vazio), sem repetir o atalho', async () => {
    render(<RunFeedPage />);
    await screen.findByText(/Nenhuma corrida ainda/);
    expect(screen.queryByRole('button', { name: '▶ Começar corrida' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Gravar corrida' })).toHaveLength(1);
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

  it('quem já correu vê o convite para ligar os avisos de corrida; quem não correu, não', async () => {
    Object.defineProperty(globalThis, 'Notification', { configurable: true, value: { permission: 'default' } });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
    Object.defineProperty(globalThis, 'PushManager', { configurable: true, value: function PushManager() {} });
    try {
      h.fetchRunFeed.mockResolvedValueOnce([friendRun]);
      const a = render(<RunFeedPage />);
      await screen.findByText('Corrida da manhã');
      expect(screen.queryByText('🔔 Quer ser avisado para correr?')).toBeNull();
      a.unmount();

      h.fetchRunFeed.mockResolvedValueOnce([{ ...friendRun, isMe: true }]);
      render(<RunFeedPage />);
      expect(await screen.findByText('🔔 Quer ser avisado para correr?')).toBeTruthy();
    } finally {
      delete globalThis.Notification;
      delete globalThis.PushManager;
      delete navigator.serviceWorker;
    }
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

describe('Minhas rotas (aba Gravar)', () => {
  it('lista a rota repetida e começa a corrida contra a melhor', async () => {
    const loop = (lat, dur, id) => ({
      client_id: id, run_date: '2026-11-0' + (id === 'a' ? 1 : 2), started_at: `2026-11-0${id === 'a' ? 1 : 2}T08:00:00Z`, duration_s: dur, distance_m: 5000,
      splits: [], gps: true, kind: 'livre', title: 'Volta do parque', visibility: 'amigos', intervals: [],
      route: [[[lat, -4600000, 0], [lat + 50, -4600000 + 50, 100]]],
    });
    h.fetchRuns.mockResolvedValue([loop(-2350000, 1700, 'a'), loop(-2350000, 1600, 'b')]);
    render(<RunHomePage />);
    await act(async () => {});
    expect(screen.getByText('Minhas rotas')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Correr de novo contra a melhor/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Começar já' }));
    expect(getLiveRun()?.ghost).toMatchObject({ id: 'b', duration_s: 1600 });
  });
});
