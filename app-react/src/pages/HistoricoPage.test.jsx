// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const { mockToast, fetchMonthSessions } = vi.hoisted(() => ({ mockToast: vi.fn(), fetchMonthSessions: vi.fn() }));

vi.mock('../lib/supabase', () => ({ db: {} }));
// Mesmo objeto a cada render, como o AuthContext real (o efeito depende de `user`).
const USER = { id: 'u1' };
vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: USER }) }));
vi.mock('../context/useToast', () => ({ useToast: () => mockToast }));
vi.mock('../lib/workoutHistory', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchMonthSessions,
}));
vi.mock('../components/SessionDetailModal', () => ({
  default: ({ session, onClose }) => <div role="dialog">detalhe {session.dayOfWeek}<button onClick={onClose}>fechar</button></div>,
}));

import HistoricoPage from './HistoricoPage';
import { todayDate } from '../data/treinoData';

function session(overrides = {}) {
  return {
    id: 's1', date: todayDate(), dayOfWeek: 'Segunda', completed: true, durationSeconds: 3600,
    rating: null, notes: '', exercises: [{ nome: 'Supino' }], doneSets: 4, totalCarga: 100, volume: 2000,
    ...overrides,
  };
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  fetchMonthSessions.mockResolvedValue([]);
});

describe('HistoricoPage', () => {
  it('mês sem treinos mostra o estado vazio', async () => {
    render(<HistoricoPage />);
    expect(await screen.findByText(/Nenhum treino registrado em/)).toBeTruthy();
  });

  it('lista as sessões e resume o mês', async () => {
    fetchMonthSessions.mockResolvedValue([session(), session({ id: 's2', date: '2000-01-01', completed: false, doneSets: 2, volume: 0, durationSeconds: null })]);
    render(<HistoricoPage />);
    expect(await screen.findByText('incompleto')).toBeTruthy();
    // 1 concluído, 6 séries no total
    expect(screen.getByText('Treinos').previousSibling.textContent).toBe('1');
    expect(screen.getByText('Séries').previousSibling.textContent).toBe('6');
  });

  it('tocar numa sessão abre o detalhe e fecha de volta', async () => {
    fetchMonthSessions.mockResolvedValue([session()]);
    render(<HistoricoPage />);
    fireEvent.click(await screen.findByText('Segunda'));
    expect(screen.getByRole('dialog').textContent).toContain('detalhe Segunda');
    fireEvent.click(screen.getByText('fechar'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('erro ao carregar avisa e não deixa a tela em loading', async () => {
    fetchMonthSessions.mockRejectedValue(new Error('rede'));
    render(<HistoricoPage />);
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('⚠️ Erro ao carregar o histórico'));
    expect(await screen.findByText(/Nenhum treino registrado em/)).toBeTruthy();
  });

  it('voltar um mês busca o mês anterior; o botão "próximo" fica desligado no mês atual', async () => {
    render(<HistoricoPage />);
    await screen.findByText(/Nenhum treino registrado em/);
    expect(screen.getByLabelText('Próximo mês').disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Mês anterior'));
    await waitFor(() => expect(fetchMonthSessions).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Próximo mês').disabled).toBe(false);
  });
});
