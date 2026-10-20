// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/influencerRanking', async orig => ({ ...(await orig()), fetchInfluencerRanking: (...a) => h.fetch(...a) }));

import RankingCard from './RankingCard';

beforeEach(() => {
  h.fetch.mockReset().mockResolvedValue([
    { position: 1, name: null, signups: 5, me: false, public: false },
    { position: 2, name: 'Ana', signups: 2, me: true, public: false },
    { position: 3, name: 'Caio', signups: 0, me: false, public: true },
  ]);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('RankingCard', () => {
  it('mostra a posição, anônimos e quem é você', async () => {
    render(<RankingCard />);
    expect(await screen.findByText('Você está em 2º lugar entre 3 influenciadores.')).toBeTruthy();
    expect(screen.getByText('Influenciador anônimo')).toBeTruthy();
    expect(screen.getByText('Ana (você)')).toBeTruthy();
    expect(screen.getByText('Caio')).toBeTruthy();
    expect(screen.getByText('🥇')).toBeTruthy();
    expect(screen.getByText('3º')).toBeTruthy(); // sem medalha para quem tem 0
  });

  it('troca para o mês passado', async () => {
    render(<RankingCard />);
    await screen.findByText('Ana (você)');
    fireEvent.click(screen.getByText('Mês passado'));
    await waitFor(() => expect(h.fetch).toHaveBeenCalledWith(1));
  });

  it('sem cadastros no mês incentiva', async () => {
    h.fetch.mockResolvedValue([{ position: 1, name: 'Ana', signups: 0, me: true, public: false }]);
    render(<RankingCard />);
    expect(await screen.findByText(/ainda não tem cadastros neste mês/)).toBeTruthy();
  });

  it('erro avisa', async () => {
    h.fetch.mockRejectedValue(new Error('x'));
    render(<RankingCard />);
    expect(await screen.findByText(/Não foi possível carregar o ranking/)).toBeTruthy();
  });
});
