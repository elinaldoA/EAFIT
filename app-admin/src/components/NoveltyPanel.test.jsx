// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock('../lib/supabase', () => ({ db: { rpc: mockRpc } }));

import NoveltyPanel from './NoveltyPanel';
import { buildNovelty, fetchNoveltyStats, pct } from '../lib/noveltyStats';

const RAW = {
  days: 30,
  users: 40,
  parq: { answered: 10, with_alert: 3, skipped: 4, with_notes: 5 },
  sets: { total: 200, users: 8, with_rir: 50, rir_users: 4, drop_set: 10, rest_pause: 5, cluster: 0, falha: 20, typed_users: 3 },
  plans: { active: 30, with_technique: 6, technique_exercises: 14, with_progression: 3, with_deload: 2 },
  runs: { runners: 5, runs: 12, km: 63.5, gps: 9 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRpc.mockResolvedValue({ data: RAW, error: null });
});
afterEach(cleanup);

describe('lib/noveltyStats', () => {
  it('pct arredonda e devolve null sem base', () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(0, 10)).toBe(0);
    expect(pct(5, 0)).toBeNull();
    expect(pct('x', 10)).toBeNull();
  });

  it('buildNovelty calcula as proporções certas', () => {
    const v = buildNovelty(RAW);
    expect(v.parq).toMatchObject({ answered: 10, answeredPct: 25, withAlert: 3, alertPct: 30, skipped: 4, withNotes: 5 });
    expect(v.rir).toMatchObject({ sets: 50, setsPct: 25, users: 4, usersPct: 50 });
    expect(v.types.find(t => t.key === 'falha')).toMatchObject({ total: 20, pct: 10 });
    expect(v.plans).toMatchObject({ techniquePct: 20, progressionPct: 10, withDeload: 2 });
    expect(v.runs).toMatchObject({ runners: 5, runnersPct: 13, km: 63.5, gpsPct: 75 });
  });

  it('buildNovelty aguenta base vazia', () => {
    const v = buildNovelty({ days: 30, users: 0, parq: {}, sets: {}, plans: {}, runs: {} });
    expect(v.parq.answeredPct).toBeNull();
    expect(v.rir.setsPct).toBeNull();
    expect(v.runs.gpsPct).toBeNull();
    expect(buildNovelty(null)).toBeNull();
  });

  it('fetchNoveltyStats chama a RPC com a janela e propaga erro', async () => {
    await fetchNoveltyStats(90);
    expect(mockRpc).toHaveBeenCalledWith('admin_novelty_stats', { days_back: 90 });
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not_authorized' } });
    await expect(fetchNoveltyStats()).rejects.toMatchObject({ message: 'not_authorized' });
  });
});

describe('NoveltyPanel', () => {
  it('mostra PAR-Q, RIR, planos e corrida só com números agregados', async () => {
    render(<NoveltyPanel />);
    expect(await screen.findByText('Ficha de saúde (PAR-Q)')).toBeTruthy();
    expect(screen.getByText('25% de 40')).toBeTruthy();
    expect(screen.getByText('30% de quem respondeu')).toBeTruthy();
    expect(screen.getByText('25% das séries')).toBeTruthy();
    expect(screen.getByText('Até a falha')).toBeTruthy();
    expect(screen.getByText('Com semana leve (deload)')).toBeTruthy();
    expect(screen.getByText('63,5')).toBeTruthy();
    expect(screen.getByText(/Só contagens/)).toBeTruthy();
  });

  it('trocar o período busca de novo com a nova janela', async () => {
    render(<NoveltyPanel />);
    await screen.findByText('Ficha de saúde (PAR-Q)');
    fireEvent.click(screen.getByRole('button', { name: '90 dias' }));
    await waitFor(() => expect(mockRpc).toHaveBeenLastCalledWith('admin_novelty_stats', { days_back: 90 }));
  });

  it('mostra o erro da consulta', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('not_authorized') });
    render(<NoveltyPanel />);
    expect(await screen.findByText('not_authorized')).toBeTruthy();
  });
});
