// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), api: {}, builder: vi.fn() }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../data/treinoData', () => ({ todayDate: () => '2026-10-07' }));
vi.mock('../components/LineChart', () => ({ default: ({ points, emptyMsg }) => <div data-testid="chart">{points.length ? points.map(p => p.value).join(',') : emptyMsg}</div> }));
vi.mock('../components/Skeleton', () => ({ default: () => <div data-testid="skeleton" /> }));
vi.mock('../components/ChatThread', () => ({ default: ({ sendLabel, load, onLoaded }) => {
  load().then(() => onLoaded());
  return <div data-testid="chat">{sendLabel}</div>;
} }));
vi.mock('./ClientSessions', () => ({ default: () => <div data-testid="sessions" /> }));
vi.mock('./ClientNotes', () => ({ default: () => <div data-testid="notes" /> }));
vi.mock('./ClientGoals', () => ({ default: () => <div data-testid="goals" /> }));
vi.mock('./ClientPhotos', () => ({ default: () => <div data-testid="photos" /> }));
vi.mock('./ClientAppointments', () => ({ default: () => <div data-testid="appointments" /> }));
vi.mock('./PlanBuilder', () => ({
  default: (props) => {
    h.builder(props);
    return (
      <div data-testid="builder">
        <button type="button" onClick={props.onBack}>voltar builder</button>
        <button type="button" onClick={props.onSent}>enviado builder</button>
      </div>
    );
  },
}));
vi.mock('../lib/trainer', async (importActual) => ({
  ...(await importActual()),
  fetchClientDetail: (...a) => h.api.fetchClientDetail(...a),
  removeClient: (...a) => h.api.removeClient(...a),
}));
vi.mock('../lib/trainerMessages', async (importActual) => ({
  ...(await importActual()),
  fetchTrainerThread: (...a) => h.api.fetchTrainerThread(...a),
  markThreadRead: (...a) => h.api.markThreadRead(...a),
  sendMessage: (...a) => h.api.sendMessage(...a),
}));

import ClientDetail from './ClientDetail';

const CLIENT = { id: 'c1', name: 'Ana', email: 'ana@x.com', last_day: '2026-10-05', paused: false };
const DETAIL = {
  profile: { meta: 'massa', nivel: 'intermediario', peso: 70.5, altura: 170, idade: 30, pesoAlvo: 68, weeklyGoal: 5 },
  training_days: ['2026-10-01', '2026-10-03', '2026-10-05', '2026-10-06', '2026-10-07'],
  weights: [{ d: '2026-09-01', v: 72 }, { d: '2026-10-01', v: 70.5 }],
  measurements: [{ d: '2026-09-01', cintura: 90 }, { d: '2026-10-01', cintura: 86.5 }],
  checkins: [{ d: '2026-10-06', energy: 4, sleep: 3, mood: 5 }],
  discomfort: [{ exercise: 'Supino Reto com Barra', d: '2026-10-02', severity: 'forte' }],
  loads: [{ exercise: 'Agachamento Livre', max: 100.5, sessions: 4 }],
  plan: { name: 'Hipertrofia', days: 5 },
};

beforeEach(() => {
  h.toast.mockReset();
  h.builder.mockReset();
  h.api = {
    fetchClientDetail: vi.fn().mockResolvedValue(DETAIL),
    removeClient: vi.fn().mockResolvedValue(undefined),
    fetchTrainerThread: vi.fn().mockResolvedValue([]),
    markThreadRead: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(1),
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const setup = (props = {}) => {
  const fns = { onBack: vi.fn(), onRemoved: vi.fn() };
  render(<ClientDetail client={CLIENT} {...fns} {...props} />);
  return fns;
};

describe('ClientDetail', () => {
  it('cabeçalho: nome, situação, e-mail, objetivo, nível e dados corporais', async () => {
    setup();
    expect(screen.getByText('Ana')).toBeTruthy();
    await screen.findByText(/Ganho de massa/);
    expect(screen.getByText(/ana@x.com/)).toBeTruthy();
    expect(screen.getByText(/Intermediário/)).toBeTruthy();
    expect(screen.getByText('30 anos · 70,5 kg · 170 cm · meta 68 kg')).toBeTruthy();
  });

  it('mostra o esqueleto enquanto carrega e a falha quando não consegue', async () => {
    h.api.fetchClientDetail.mockReturnValue(new Promise(() => {}));
    setup();
    expect(screen.getByTestId('skeleton')).toBeTruthy();
    cleanup();
    h.api.fetchClientDetail.mockRejectedValue(new Error('x'));
    setup();
    expect(await screen.findByText('Não foi possível carregar os dados deste aluno.')).toBeTruthy();
  });

  it('frequência: treinos em 7 dias com a meta, 30 dias, sequência e último treino', async () => {
    setup();
    await screen.findByText('Frequência');
    expect(screen.getByText('treinos em 7 dias (meta)').previousSibling.textContent).toBe('5/5');
    expect(screen.getByText('treinos em 30 dias')).toBeTruthy();
  });

  it('peso com a variação no período e o gráfico', async () => {
    setup();
    await screen.findByText(/-1,5 kg no período/);
    expect(screen.getByTestId('chart').textContent).toBe('72,70.5');
  });

  it('medidas, check-ins, desconfortos e cargas máximas', async () => {
    setup();
    await screen.findByText('Medidas corporais (cm)');
    expect(screen.getByText(/90 → 86.5 cm/)).toBeTruthy();
    expect(screen.getByText('Como ele tem se sentido (30 dias)')).toBeTruthy();
    expect(screen.getByText('Forte')).toBeTruthy();
    expect(screen.getByText('100,5 kg')).toBeTruthy();
    expect(screen.getByText('4 treino(s)', { exact: false })).toBeTruthy();
  });

  it('inclui as seções do aluno: sessões, metas, anotações, aulas, fotos e conversa', async () => {
    setup();
    for (const id of ['sessions', 'goals', 'notes', 'appointments', 'photos', 'chat']) {
      expect(await screen.findByTestId(id)).toBeTruthy();
    }
    expect(screen.getByTestId('chat').textContent).toBe('Enviar recado');
  });

  it('abrir a conversa marca as respostas do aluno como lidas', async () => {
    setup();
    await waitFor(() => expect(h.api.markThreadRead).toHaveBeenCalledWith('c1'));
    expect(h.api.fetchTrainerThread).toHaveBeenCalledWith('c1');
  });

  it('plano atual: com plano oferece editar; sem plano oferece montar', async () => {
    setup();
    expect(await screen.findByText('Hipertrofia · 5 dia(s)')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Editar \/ enviar novo treino/ })).toBeTruthy();
    cleanup();
    h.api.fetchClientDetail.mockResolvedValue({ ...DETAIL, plan: null });
    setup();
    expect(await screen.findByText('O aluno ainda não tem plano ativo.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Montar treino/ })).toBeTruthy();
  });

  it('montar o treino abre o editor; ao enviar volta à ficha e recarrega os dados', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: /Editar \/ enviar novo treino/ }));
    expect(h.builder).toHaveBeenLastCalledWith(expect.objectContaining({ client: CLIENT }));
    expect(h.api.fetchClientDetail).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'enviado builder' }));
    await screen.findByText('Frequência');
    expect(h.api.fetchClientDetail).toHaveBeenCalledTimes(2);
  });

  it('voltar do editor volta à ficha sem recarregar', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: /Editar \/ enviar novo treino/ }));
    fireEvent.click(screen.getByRole('button', { name: 'voltar builder' }));
    await screen.findByText('Frequência');
    expect(h.api.fetchClientDetail).toHaveBeenCalledTimes(1);
  });

  it('voltar aos alunos', async () => {
    const { onBack } = setup();
    fireEvent.click(screen.getByRole('button', { name: '‹ Voltar aos alunos' }));
    expect(onBack).toHaveBeenCalled();
    await screen.findByText('Frequência');
  });

  it('encerrar o acompanhamento pede confirmação, encerra e avisa o pai', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { onRemoved } = setup();
    const btn = await screen.findByRole('button', { name: 'Encerrar acompanhamento' });
    fireEvent.click(btn);
    expect(h.api.removeClient).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(btn);
    await waitFor(() => expect(h.api.removeClient).toHaveBeenCalledWith('c1'));
    expect(h.toast).toHaveBeenCalledWith('Vínculo encerrado');
    expect(onRemoved).toHaveBeenCalled();
  });

  it('erro ao encerrar avisa e não sai da ficha', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    h.api.removeClient.mockRejectedValue(new Error('not_authorized'));
    const { onRemoved } = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Encerrar acompanhamento' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.stringContaining('❌')));
    expect(onRemoved).not.toHaveBeenCalled();
  });

  it('aluno em pausa mostra até quando', async () => {
    h.api.fetchClientDetail.mockResolvedValue({ ...DETAIL, profile: { ...DETAIL.profile, pausedUntil: '2026-10-24' } });
    setup();
    expect(await screen.findByText('⏸ Em pausa até 24/10')).toBeTruthy();
  });

  it('seções sem dados não aparecem', async () => {
    h.api.fetchClientDetail.mockResolvedValue({
      profile: {}, training_days: [], weights: [], measurements: [], checkins: [], discomfort: [], loads: [], plan: null,
    });
    setup();
    await screen.findByText('Frequência');
    expect(screen.queryByText('Medidas corporais (cm)')).toBeNull();
    expect(screen.queryByText(/Desconfortos/)).toBeNull();
    expect(screen.queryByText(/Cargas máximas/)).toBeNull();
    expect(screen.getByTestId('chart').textContent).toBe('O aluno ainda não registrou o peso.');
  });
});
