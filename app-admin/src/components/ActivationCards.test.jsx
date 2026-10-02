// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const { mockFunnel, mockRetention, mockSources } = vi.hoisted(() => ({ mockFunnel: vi.fn(), mockRetention: vi.fn(), mockSources: vi.fn() }));

vi.mock('../lib/dashboardStats', () => ({
  fetchFunnel: mockFunnel,
  fetchRetentionCohorts: mockRetention,
  fetchVisitSources: mockSources,
}));

import ActivationFunnel from './ActivationFunnel';
import RetentionCohorts from './RetentionCohorts';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ActivationFunnel', () => {
  it('mostra as etapas, marca a maior perda e recarrega ao trocar o período', async () => {
    mockFunnel.mockResolvedValue({ visits: '120', signed_up: '50', confirmed: '45', onboarded: '40', first_workout: '12', second_workout_7d: '8', visits_since: '2026-10-02' });
    mockSources.mockResolvedValue([{ page: 'landing', source: 'card', visits: '7' }, { page: 'acesso', source: 'card', visits: '3' }]);
    render(<ActivationFunnel />);

    expect(await screen.findByText('Fizeram o 1º treino')).toBeTruthy();
    expect(screen.getByText('30% da etapa anterior')).toBeTruthy();
    expect(screen.getByText('maior perda').closest('li').textContent).toContain('1º treino');
    expect(mockFunnel).toHaveBeenCalledWith(30);
    expect(screen.getByText('Card de treino compartilhado').closest('tr').textContent).toContain('10');
    expect(screen.getByText(/desde 02\/10\/2026/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    expect(mockFunnel).toHaveBeenLastCalledWith(0);
    expect(mockSources).toHaveBeenLastCalledWith(0);
  });
});

describe('RetentionCohorts', () => {
  it('desenha a tabela com semana parcial marcada', async () => {
    mockRetention.mockResolvedValue([
      { cohort_week: '2026-09-14', cohort_size: 4, week_index: 0, active_users: 2, complete: true },
      { cohort_week: '2026-09-14', cohort_size: 4, week_index: 1, active_users: 1, complete: false },
    ]);
    render(<RetentionCohorts />);

    expect(await screen.findByText('14/09')).toBeTruthy();
    expect(screen.getAllByText('50%').length).toBeGreaterThan(0);
    expect(screen.getByText('25%*')).toBeTruthy();
  });

  it('avisa quando não há cadastros', async () => {
    mockRetention.mockResolvedValue([]);
    render(<RetentionCohorts />);
    expect(await screen.findByText(/Nenhum cadastro/)).toBeTruthy();
  });
});
