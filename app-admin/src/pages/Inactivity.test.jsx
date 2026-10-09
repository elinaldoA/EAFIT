// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { lib } = vi.hoisted(() => ({ lib: { fetchInactivitySummary: vi.fn(), fetchInactivityAnswers: vi.fn() } }));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/inactivity', async orig => ({ ...(await orig()), ...lib }));

import Inactivity from './Inactivity';
import { summarizeSurveys } from '../lib/inactivity';

const wrap = ui => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('Inactivity', () => {
  it('mostra envios, taxa de resposta, motivos e as respostas com link pro usuário', async () => {
    lib.fetchInactivitySummary.mockResolvedValue(summarizeSurveys([
      { is_segment: 'absent', is_reason: '', is_total: 3 },
      { is_segment: 'absent', is_reason: 'sem_tempo', is_total: 1 },
    ]));
    lib.fetchInactivityAnswers.mockResolvedValue([
      { id: 1, userId: 'u1', email: 'a@x.com', name: 'Ana', segment: 'absent', reason: 'sem_tempo', comment: 'dois empregos', days: 45, neverTrained: false, answeredAt: '2026-10-12T12:00:00Z' },
    ]);
    wrap(<Inactivity />);
    expect(await screen.findByText('pesquisas enviadas')).toBeTruthy();
    expect(screen.getByText('respostas (25% de quem recebeu)')).toBeTruthy();
    expect(screen.getAllByText('Sem tempo').length).toBe(2);
    expect(screen.getByText('dois empregos')).toBeTruthy();
    expect(screen.getByText(/45 dias sem treinar/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ana' }).getAttribute('href')).toBe('/users/u1');
  });

  it('sem envios mostra o aviso; erro aparece na tela', async () => {
    lib.fetchInactivitySummary.mockResolvedValue(summarizeSurveys([]));
    lib.fetchInactivityAnswers.mockResolvedValue([]);
    const { unmount } = wrap(<Inactivity />);
    expect(await screen.findByText(/Nenhuma pesquisa enviada ainda/)).toBeTruthy();
    unmount();

    lib.fetchInactivitySummary.mockRejectedValue(new Error('not_authorized'));
    wrap(<Inactivity />);
    expect(await screen.findByText('not_authorized')).toBeTruthy();
  });
});
