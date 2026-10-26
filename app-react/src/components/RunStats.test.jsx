// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ user: { id: 'u1' }, fetchRuns: vi.fn() }));

vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('../lib/runStats', async importOriginal => ({ ...(await importOriginal()), fetchRuns: (...a) => h.fetchRuns(...a) }));

import RunStats from './RunStats';

const today = new Date();
const iso = offset => {
  const d = new Date(today);
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

beforeEach(() => { h.fetchRuns.mockReset(); });
afterEach(cleanup);

describe('RunStats', () => {
  it('não aparece enquanto não há corrida registrada', async () => {
    h.fetchRuns.mockResolvedValue([]);
    const { container } = render(<RunStats />);
    await waitFor(() => expect(h.fetchRuns).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('mostra total, melhor ritmo e maior distância', async () => {
    h.fetchRuns.mockResolvedValue([
      { date: iso(1), nome: 'Corrida Leve (Trote)', minutes: 30, km: 5 },
      { date: iso(2), nome: 'Corrida Contínua (Longão)', minutes: 60, km: 10 },
    ]);
    render(<RunStats />);
    expect(await screen.findByText('Corridas')).toBeTruthy();
    expect(screen.getByText('km no total').previousSibling.textContent).toBe('15');
    expect(screen.getByText('Melhor ritmo (min/km)').previousSibling.textContent).toBe('6:00');
    expect(screen.getByText('Maior distância (km)').previousSibling.textContent).toBe('10');
    expect(screen.getByText('corridas').previousSibling.textContent).toBe('2');
  });

  it('erro na busca não quebra a tela', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.fetchRuns.mockRejectedValue(new Error('rede'));
    const { container } = render(<RunStats />);
    await waitFor(() => expect(err).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
    err.mockRestore();
  });
});
