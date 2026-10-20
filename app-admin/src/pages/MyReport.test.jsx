// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const { lib } = vi.hoisted(() => ({ lib: { fetchMyCards: vi.fn(), saveMyCards: vi.fn(), fetchReport: vi.fn() } }));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => ({ adminUser: { id: 'adm1' } }) }));
vi.mock('../lib/reports', async orig => ({ ...(await orig()), ...lib }));

import MyReport from './MyReport';
import { baseKeys, compareRange, computeCards, periodRange } from '../lib/reports';

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('reports', () => {
  it('calcula períodos, comparação e cartões derivados', () => {
    expect(periodRange('7d', '2026-10-20')).toEqual({ from: '2026-10-14', to: '2026-10-20' });
    expect(periodRange('mes', '2026-10-20')).toEqual({ from: '2026-10-01', to: '2026-10-20' });
    expect(periodRange('mes_passado', '2026-03-05')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodRange('custom', '2026-10-20', { from: '2026-10-10', to: '2026-10-01' })).toEqual({ from: '2026-09-21', to: '2026-10-20' });
    expect(compareRange({ from: '2026-10-14', to: '2026-10-20' }, 'anterior')).toEqual({ from: '2026-10-07', to: '2026-10-13' });
    expect(compareRange({ from: '2024-02-29', to: '2024-03-10' }, 'ano')).toEqual({ from: '2023-02-28', to: '2023-03-10' });
    expect(baseKeys(['activation_pct', 'signups', 'nada']).sort()).toEqual(['activated', 'signups']);

    const [act, del] = computeCards(['activation_pct', 'deletions'], { activated: 3, signups: 10, deletions: 2 }, { activated: 1, signups: 10, deletions: 4 });
    expect(act).toMatchObject({ value: 30, prev: 10, delta: 20, better: true });
    expect(del).toMatchObject({ value: 2, prev: 4, delta: -2, deltaPct: -50, better: true });
    expect(computeCards(['activation_pct'], { activated: 0, signups: 0 }, null)[0]).toMatchObject({ value: null, delta: null });
  });
});

describe('MyReport', () => {
  it('mostra os cartões, troca o período e salva a edição', async () => {
    lib.fetchMyCards.mockResolvedValue(['signups']);
    lib.fetchReport.mockResolvedValue([{ key: 'signups', label: 'Cadastros', value: 12, prev: 8, delta: 4, deltaPct: 50, better: true }]);
    lib.saveMyCards.mockResolvedValue();
    render(<MyReport />);
    expect(await screen.findByText('Cadastros')).toBeTruthy();
    expect(screen.getByText('+4 (+50%)')).toBeTruthy();
    expect(lib.fetchReport.mock.calls[0][0]).toEqual(['signups']);

    fireEvent.click(screen.getByText('7 dias'));
    await waitFor(() => expect(lib.fetchReport).toHaveBeenCalledTimes(2));
    const [, range, cmp] = lib.fetchReport.mock.calls[1];
    expect(cmp.to < range.from).toBe(true);

    fireEvent.click(screen.getByText('Editar cartões'));
    fireEvent.change(screen.getByLabelText('Adicionar cartão'), { target: { value: 'deletions' } });
    fireEvent.click(screen.getByText('Salvar cartões'));
    await waitFor(() => expect(lib.saveMyCards).toHaveBeenCalledWith('adm1', ['signups', 'deletions']));
  });
});
