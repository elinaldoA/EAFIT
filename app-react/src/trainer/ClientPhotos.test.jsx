// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ fetchClientPhotos: vi.fn() }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../components/Skeleton', () => ({ default: () => <div data-testid="skeleton" /> }));
vi.mock('../lib/trainerPhotos', async (importActual) => ({
  ...(await importActual()),
  fetchClientPhotos: (...a) => h.fetchClientPhotos(...a),
}));

import ClientPhotos from './ClientPhotos';

const CLIENT = { id: 'c1', name: 'Ana' };
const PHOTOS = [
  { id: 'p1', date: '2026-08-01', note: 'início', url: 'https://x/1.jpg' },
  { id: 'p2', date: '2026-09-01', note: null, url: 'https://x/2.jpg' },
  { id: 'p3', date: '2026-10-01', note: 'agora', url: 'https://x/3.jpg' },
];

beforeEach(() => {
  h.fetchClientPhotos.mockReset().mockResolvedValue({ shared: true, photos: PHOTOS });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ClientPhotos', () => {
  it('mostra o esqueleto enquanto carrega', () => {
    h.fetchClientPhotos.mockReturnValue(new Promise(() => {}));
    render(<ClientPhotos client={CLIENT} />);
    expect(screen.getByTestId('skeleton')).toBeTruthy();
  });

  it('aluno que não compartilhou: mensagem de privacidade', async () => {
    h.fetchClientPhotos.mockResolvedValue({ shared: false, photos: [] });
    render(<ClientPhotos client={CLIENT} />);
    expect(await screen.findByText('Ana não compartilhou as fotos de evolução com você.')).toBeTruthy();
  });

  it('falha ao carregar avisa em vez de dizer que não compartilhou', async () => {
    h.fetchClientPhotos.mockRejectedValue(new Error('x'));
    render(<ClientPhotos client={CLIENT} />);
    expect(await screen.findByText('Não foi possível carregar as fotos agora.')).toBeTruthy();
  });

  it('compartilhou mas ainda sem fotos', async () => {
    h.fetchClientPhotos.mockResolvedValue({ shared: true, photos: [] });
    render(<ClientPhotos client={CLIENT} />);
    expect(await screen.findByText('O aluno ainda não tem fotos.')).toBeTruthy();
  });

  it('mostra antes e depois (primeira e última) e a linha do tempo', async () => {
    render(<ClientPhotos client={CLIENT} />);
    expect(await screen.findByText(/Antes ·/)).toBeTruthy();
    expect(screen.getByText(/Depois ·/)).toBeTruthy();
    expect(screen.getByAltText(/Antes:/).getAttribute('src')).toBe('https://x/1.jpg');
    expect(screen.getByAltText(/Depois:/).getAttribute('src')).toBe('https://x/3.jpg');
    expect(document.querySelectorAll('.photo-strip button')).toHaveLength(3);
  });

  it('uma única foto não gera antes/depois', async () => {
    h.fetchClientPhotos.mockResolvedValue({ shared: true, photos: [PHOTOS[0]] });
    render(<ClientPhotos client={CLIENT} />);
    await waitFor(() => expect(document.querySelectorAll('.photo-strip button')).toHaveLength(1));
    expect(screen.queryByText(/Antes ·/)).toBeNull();
  });

  it('tocar numa foto amplia com a nota; tocar de novo fecha', async () => {
    render(<ClientPhotos client={CLIENT} />);
    await screen.findByText(/Antes ·/);
    fireEvent.click(document.querySelectorAll('.photo-strip button')[2]);
    const zoom = screen.getByRole('button', { name: 'Fechar foto' });
    expect(zoom.textContent).toContain('agora');
    fireEvent.click(zoom);
    expect(screen.queryByRole('button', { name: 'Fechar foto' })).toBeNull();
  });
});
