// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const { lib } = vi.hoisted(() => ({
  lib: { fetchSeries: vi.fn(), createSeries: vi.fn(), fetchSeriesReport: vi.fn(), setSeriesActive: vi.fn(), spawnNow: vi.fn() },
}));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => ({ adminUser: { id: 'adm1' } }) }));
vi.mock('../lib/challengeSeries', async orig => ({ ...(await orig()), ...lib }));

import ChallengeSeriesCard from './ChallengeSeriesCard';
import { mapEdition, seriesTrend, validateSeries } from '../lib/challengeSeries';

const ed = (id, start, members, extra = {}) => mapEdition({
  sr_challenge: id, sr_title: `Semana · ${start}`, sr_code: 'ABC', sr_start: start, sr_end: start,
  sr_members: members, sr_trained: 2, sr_completed: 1, sr_returning: 1, sr_avg_days: '2.5', ...extra,
});

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('challengeSeries', () => {
  it('valida a série e calcula as taxas e a tendência', () => {
    expect(validateSeries({ title: 'ab', cadence: 'semanal', minDays: 3 }).ok).toBe(false);
    expect(validateSeries({ title: 'Semana', cadence: 'semanal', minDays: 8 }).ok).toBe(false);
    expect(validateSeries({ title: 'Mês', cadence: 'mensal', minDays: 20 }).value).toEqual({ title: 'Mês', cadence: 'mensal', min_days: 20 });
    expect(ed('a', '2026-10-19', 4)).toMatchObject({ trainedPct: 50, completedPct: 25, returningPct: 25, avgDays: 2.5 });
    expect(ed('a', '2026-10-19', 0).trainedPct).toBeNull();
    const eds = [ed('c', '2026-10-26', 9), ed('b', '2026-10-19', 6), ed('a', '2026-10-12', 4)];
    expect(seriesTrend(eds, '2026-10-20')).toEqual({ current: 6, previous: 4, diff: 2 });
    expect(seriesTrend(eds.slice(0, 2), '2026-10-20')).toBeNull();
  });
});

describe('ChallengeSeriesCard', () => {
  it('cria série, abre o relatório e pausa', async () => {
    lib.fetchSeries.mockResolvedValue([{ id: 's1', title: 'Semana forte', cadence: 'semanal', min_days: 3, active: true }]);
    lib.createSeries.mockResolvedValue(1);
    lib.fetchSeriesReport.mockResolvedValue([ed('b', '2026-10-19', 6)]);
    lib.setSeriesActive.mockResolvedValue();
    const onSpawned = vi.fn();
    render(<ChallengeSeriesCard onSpawned={onSpawned} />);
    expect(await screen.findByText('Semana forte')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('Desafio EAFIT'), { target: { value: 'Mês EAFIT' } });
    fireEvent.click(screen.getByText('Criar série'));
    await waitFor(() => expect(lib.createSeries).toHaveBeenCalledWith({ title: 'Mês EAFIT', cadence: 'semanal', minDays: 3 }, 'adm1'));
    expect(await screen.findByText(/Série criada. 1 edição/)).toBeTruthy();
    expect(onSpawned).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Relatório'));
    expect(await screen.findByText('Semana · 2026-10-19')).toBeTruthy();
    expect(screen.getByText('2 (33%)')).toBeTruthy();

    fireEvent.click(screen.getByText('Pausar'));
    await waitFor(() => expect(lib.setSeriesActive).toHaveBeenCalledWith('s1', false));
  });
});
