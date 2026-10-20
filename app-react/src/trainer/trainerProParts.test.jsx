// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), api: {} }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('./MessagesPage', () => ({ default: ({ header }) => <div data-testid="recados">{header}</div> }));
vi.mock('./ClassPage', () => ({ default: ({ header }) => <div data-testid="desafios">{header}</div> }));
vi.mock('../lib/trainerRoster', async (importActual) => ({
  ...(await importActual()),
  setClientTags: (...a) => h.api.setClientTags(...a),
  fetchClientPlans: (...a) => h.api.fetchClientPlans(...a),
}));

import TurmaPage from './TurmaPage';
import ClientTags from './ClientTags';
import ClientPlanHistory from './ClientPlanHistory';

beforeEach(() => {
  h.toast.mockReset();
  h.api = {
    setClientTags: vi.fn(async (_id, tags) => tags),
    fetchClientPlans: vi.fn().mockResolvedValue([]),
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('TurmaPage', () => {
  it('alterna entre recados e desafios', () => {
    const onView = vi.fn();
    render(<TurmaPage view="recados" onView={onView} />);
    expect(screen.getByTestId('recados')).toBeTruthy();
    expect(screen.getByRole('tab', { name: '💬 Recados' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: '🏆 Desafios' }));
    expect(onView).toHaveBeenCalledWith('desafios');
    cleanup();
    render(<TurmaPage view="desafios" onView={onView} />);
    expect(screen.getByTestId('desafios')).toBeTruthy();
  });
});

describe('ClientTags', () => {
  it('adiciona e remove etiquetas, salvando na hora', async () => {
    render(<ClientTags clientId="c1" initial={['Online']} />);
    fireEvent.change(screen.getByLabelText('Nova etiqueta'), { target: { value: 'VIP' } });
    fireEvent.submit(screen.getByLabelText('Nova etiqueta').closest('form'));
    await waitFor(() => expect(h.api.setClientTags).toHaveBeenCalledWith('c1', ['Online', 'VIP']));
    expect(await screen.findByText('VIP')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remover etiqueta Online' }));
    await waitFor(() => expect(h.api.setClientTags).toHaveBeenLastCalledWith('c1', ['VIP']));
  });

  it('erro ao salvar volta ao que era e avisa', async () => {
    h.api.setClientTags.mockRejectedValue(new Error('invalid_tags'));
    render(<ClientTags clientId="c1" initial={['Online']} />);
    fireEvent.change(screen.getByLabelText('Nova etiqueta'), { target: { value: 'VIP' } });
    fireEvent.submit(screen.getByLabelText('Nova etiqueta').closest('form'));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.stringContaining('Até 6 etiquetas')));
    expect(screen.queryByText('VIP')).toBeNull();
  });

  it('com 6 etiquetas o campo some', () => {
    render(<ClientTags clientId="c1" initial={['a', 'b', 'c', 'd', 'e', 'f']} />);
    expect(screen.queryByLabelText('Nova etiqueta')).toBeNull();
  });
});

describe('ClientPlanHistory', () => {
  it('lista os ciclos com autor e período; o ativo marcado', async () => {
    h.api.fetchClientPlans.mockResolvedValue([
      { id: 'p1', name: 'Hipertrofia 2', active: true, byMe: true, days: 4, start: '2026-10-01', end: '2026-11-26', at: '2026-10-01T10:00:00Z' },
      { id: 'p2', name: 'Do app', active: false, byMe: false, days: 3, start: null, end: null, at: '2026-08-10T10:00:00Z' },
    ]);
    render(<ClientPlanHistory clientId="c1" />);
    expect(await screen.findByText('Hipertrofia 2')).toBeTruthy();
    expect(screen.getByText('Ativo')).toBeTruthy();
    expect(screen.getByText(/4 dia\(s\) · por você/)).toBeTruthy();
    expect(screen.getByText(/pelo aluno ou pelo app · criado em/)).toBeTruthy();
  });

  it('sem histórico (ou RPC ausente) não mostra nada', async () => {
    h.api.fetchClientPlans.mockRejectedValue(new Error('PGRST202'));
    const { container } = render(<ClientPlanHistory clientId="c1" />);
    await waitFor(() => expect(h.api.fetchClientPlans).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
});
