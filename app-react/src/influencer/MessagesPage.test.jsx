// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ fetch: vi.fn(), markOne: vi.fn() }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/inbox', async orig => ({
  ...(await orig()),
  fetchInfluencerMessages: (...a) => h.fetch(...a),
  markInboxItemRead: (...a) => h.markOne(...a),
}));

import MessagesPage from './MessagesPage';

const NOW = new Date().toISOString();

beforeEach(() => {
  h.fetch.mockReset();
  h.markOne.mockReset().mockResolvedValue();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MessagesPage', () => {
  it('lista os recados e marca só os novos como lidos', async () => {
    h.fetch.mockResolvedValue([
      { id: 1, title: 'Campanha de novembro', body: 'Poste até sexta', created_at: NOW, read_at: null },
      { id: 2, title: 'Boas-vindas', body: 'Oi!', created_at: NOW, read_at: NOW },
    ]);
    const onRead = vi.fn();
    render(<MessagesPage onRead={onRead} />);
    expect(await screen.findByText('Campanha de novembro')).toBeTruthy();
    expect(screen.getByText('Boas-vindas')).toBeTruthy();
    await waitFor(() => expect(onRead).toHaveBeenCalled());
    expect(h.markOne).toHaveBeenCalledTimes(1);
    expect(h.markOne).toHaveBeenCalledWith(1);
    expect(screen.getByText('Campanha de novembro').closest('article').className).toContain('inbox__item--unread');
  });

  it('sem recados mostra o aviso e não marca nada', async () => {
    h.fetch.mockResolvedValue([]);
    const onRead = vi.fn();
    render(<MessagesPage onRead={onRead} />);
    expect(await screen.findByText(/Nenhum recado ainda/)).toBeTruthy();
    expect(h.markOne).not.toHaveBeenCalled();
    expect(onRead).not.toHaveBeenCalled();
  });

  it('erro ao carregar avisa', async () => {
    h.fetch.mockRejectedValue(new Error('rede'));
    render(<MessagesPage />);
    expect(await screen.findByText(/Não foi possível carregar os recados/)).toBeTruthy();
  });
});
