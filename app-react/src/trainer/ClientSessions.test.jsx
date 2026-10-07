// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({ fetchClientSessions: vi.fn() }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../components/Loading', () => ({ default: () => <div data-testid="loading" /> }));
vi.mock('../lib/trainerInsights', async (importActual) => ({
  ...(await importActual()),
  fetchClientSessions: (...a) => h.fetchClientSessions(...a),
}));

import ClientSessions from './ClientSessions';

// mais recente primeiro (como vem de trainer_client_sessions)
const RAW = [
  { id: 's2', date: '2026-10-05', day: 'Segunda', completed: true, duration: 3600, rating: 4, notes: 'ombro estalando',
    sets: [{ exercise: 'Supino Reto com Barra', n: 1, carga: '85', reps: '8' }, { exercise: 'Supino Reto com Barra', n: 2, carga: '85', reps: '7' }] },
  { id: 's1', date: '2026-09-28', day: 'Segunda', completed: false, duration: null, rating: null, notes: '',
    sets: [{ exercise: 'Supino Reto com Barra', n: 1, carga: '80', reps: '8' }] },
];

beforeEach(() => {
  h.fetchClientSessions.mockReset().mockResolvedValue(RAW);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ClientSessions', () => {
  it('mostra o carregando e depois as sessões', async () => {
    render(<ClientSessions clientId="c1" />);
    expect(screen.getByTestId('loading')).toBeTruthy();
    expect(await screen.findByText(/Segunda$/)).toBeTruthy();
    expect(h.fetchClientSessions).toHaveBeenCalledWith('c1', 12);
  });

  it('sem sessões ou com falha mostra o vazio', async () => {
    h.fetchClientSessions.mockResolvedValue([]);
    render(<ClientSessions clientId="c1" />);
    expect(await screen.findByText('O aluno ainda não registrou treinos.')).toBeTruthy();
    cleanup();
    h.fetchClientSessions.mockRejectedValue(new Error('x'));
    render(<ClientSessions clientId="c1" />);
    expect(await screen.findByText('O aluno ainda não registrou treinos.')).toBeTruthy();
  });

  it('resume a sessão: duração, nota em estrelas, evolução e observação', async () => {
    render(<ClientSessions clientId="c1" />);
    const head = await screen.findByRole('button', { name: /05\/10/ });
    expect(head.textContent).toContain('60 min');
    expect(head.textContent).toContain('★★★★');
    expect(head.textContent).toContain('↑ 1 evoluíram');
    expect(head.textContent).toContain('📝 com observação');
  });

  it('sessão incompleta é marcada', async () => {
    render(<ClientSessions clientId="c1" />);
    expect((await screen.findByRole('button', { name: /28\/09/ })).textContent).toContain('(incompleto)');
  });

  it('abrir mostra as séries do exercício, a variação de carga e a observação', async () => {
    render(<ClientSessions clientId="c1" />);
    fireEvent.click(await screen.findByRole('button', { name: /05\/10/ }));
    expect(screen.getAllByText('Supino Reto com Barra').length).toBeGreaterThan(0);
    expect(screen.getByText('85×8 · 85×7')).toBeTruthy();
    expect(screen.getByText('↑ 5 kg')).toBeTruthy();
    expect(screen.getByText(/ombro estalando/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /05\/10/ }));
    expect(screen.queryByText('85×8 · 85×7')).toBeNull();
  });
});
