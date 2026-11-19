// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  list: [],
  toast: vi.fn(),
  fetch: vi.fn(),
  join: vi.fn(async () => {}),
  share: vi.fn(async () => 'shared'),
  leave: vi.fn(async () => {}),
  ranking: vi.fn(async () => [{ name: 'Ana', isMe: false, value: 30, rank: 1 }, { name: 'Bia', isMe: true, value: 12, rank: 2 }]),
}));

vi.mock('../../lib/supabase', () => ({ db: {} }));
vi.mock('../../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../../data/treinoData', () => ({ todayDate: () => '2026-11-19' }));
vi.mock('./runShareCard', () => ({ renderChallengeCard: vi.fn(async () => 'blob'), shareChallengeCard: (...a) => h.share(...a) }));
vi.mock('./runsCommunity', async orig => ({
  ...(await orig()),
  fetchCommunityChallenges: (...a) => h.fetch(...a),
  joinCommunityChallenge: (...a) => h.join(...a),
  leaveCommunityChallenge: (...a) => h.leave(...a),
  fetchCommunityRanking: (...a) => h.ranking(...a),
}));

import CommunityChallenges from './CommunityChallenges';

const ch = (over = {}) => ({
  id: 'c1', title: 'Desafio de novembro', description: 'Bata 100 km', metric: 'km', goal: 100,
  start: '2026-11-01', end: '2026-11-30', members: 8, joined: false, value: null, rank: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.fetch.mockImplementation(async () => h.list);
});
afterEach(() => cleanup());

describe('CommunityChallenges', () => {
  it('não mostra nada sem desafio aberto', async () => {
    h.list = [];
    const { container } = render(<CommunityChallenges />);
    await waitFor(() => expect(h.fetch).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('não quebra nem aparece se o banco falhar', async () => {
    h.fetch.mockRejectedValueOnce(new Error('sem tabela'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(<CommunityChallenges />);
    await waitFor(() => expect(h.fetch).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('quem não entrou vê o aviso de privacidade e entra com um toque', async () => {
    h.list = [ch()];
    render(<CommunityChallenges />);
    expect(await screen.findByText('Desafio de novembro')).toBeTruthy();
    expect(screen.getByText(/Meta: 100 km/)).toBeTruthy();
    expect(screen.getByText(/8 participantes/)).toBeTruthy();
    expect(screen.getByText(/ninguém vê a corrida, só o total/)).toBeTruthy();
    h.list = [ch({ joined: true, value: 12, rank: 2 })];
    fireEvent.click(screen.getByText('Participar do desafio'));
    await waitFor(() => expect(h.join).toHaveBeenCalledWith('c1'));
    expect(await screen.findByText(/12 km de 100 km/)).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('12');
    expect(h.toast).toHaveBeenCalledWith('🎉 Você entrou no desafio!');
  });

  it('participante vê progresso, posição e ranking, e pode sair', async () => {
    h.list = [ch({ joined: true, value: 12, rank: 2 })];
    render(<CommunityChallenges />);
    expect(await screen.findByText(/2º lugar/)).toBeTruthy();
    fireEvent.click(screen.getByText('Ver ranking'));
    expect(await screen.findByText(/Ana/)).toBeTruthy();
    expect(screen.getByText(/Você/)).toBeTruthy();
    expect(screen.getByText('30 km')).toBeTruthy();
    fireEvent.click(screen.getByText('Sair'));
    await waitFor(() => expect(h.leave).toHaveBeenCalledWith('c1'));
  });

  it('mostra conclusão ao bater a meta', async () => {
    h.list = [ch({ joined: true, value: 101, rank: 1 })];
    render(<CommunityChallenges />);
    expect(await screen.findByText('🏅 Desafio concluído!')).toBeTruthy();
  });

  it('só quem concluiu vê o botão de compartilhar, e ele gera o cartão do desafio', async () => {
    h.list = [ch({ joined: true, value: 40, rank: 3 })];
    const { unmount } = render(<CommunityChallenges />);
    await screen.findByText(/3º lugar/);
    expect(screen.queryByText('📤 Compartilhar')).toBeNull();
    unmount();
    h.list = [ch({ joined: true, value: 101, rank: 1 })];
    render(<CommunityChallenges />);
    fireEvent.click(await screen.findByText('📤 Compartilhar'));
    await waitFor(() => expect(h.share).toHaveBeenCalled());
    expect(h.share.mock.calls[0][0]).toMatchObject({ id: 'c1', value: 101 });
  });

  it('entrega a lista carregada para quem precisa dela (medalhas)', async () => {
    h.list = [ch({ joined: true, value: 101, rank: 1 })];
    const onLoaded = vi.fn();
    render(<CommunityChallenges onLoaded={onLoaded} />);
    await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(h.list));
  });

  it('desafio encerrado só aparece para quem entrou, sem botão de sair', async () => {
    h.list = [ch({ id: 'a', title: 'Antigo sem mim', end: '2026-11-10' }), ch({ id: 'b', title: 'Antigo meu', end: '2026-11-10', joined: true, value: 5, rank: 1 })];
    render(<CommunityChallenges />);
    expect(await screen.findByText('Antigo meu')).toBeTruthy();
    expect(screen.queryByText('Antigo sem mim')).toBeNull();
    expect(screen.queryByText('Sair')).toBeNull();
    expect(screen.getByText(/encerrado/)).toBeTruthy();
  });

  it('mostra a mensagem de erro do banco ao falhar a entrada', async () => {
    h.list = [ch()];
    h.join.mockRejectedValueOnce({ message: 'challenge_ended' });
    render(<CommunityChallenges />);
    fireEvent.click(await screen.findByText('Participar do desafio'));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith('Esse desafio já terminou.'));
  });
});
