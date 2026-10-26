// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock('../lib/supabase', () => ({ db: { rpc: mockRpc } }));

import TrainingPatternsCard from './TrainingPatternsCard';
import { buildHeatmap, buildPlaces, buildModalities, fetchModalities } from '../lib/trainingPatterns';

const HEAT = [
  { th_dow: 1, th_hour: 19, th_sessions: 8, th_users: 5 },
  { th_dow: 3, th_hour: 19, th_sessions: 4, th_users: 3 },
  { th_dow: 3, th_hour: 7, th_sessions: 2, th_users: 2 },
];
const PLACES = [
  { pb_place: 'academia', pb_users: 10, pb_with_plan: 8, pb_trained30: 6, pb_never: 2, pb_sessions_week: 2.5, pb_cohort: 4, pb_cohort_active: 3, pb_pain: 1 },
  { pb_place: 'casa', pb_users: 4, pb_with_plan: 4, pb_trained30: 1, pb_never: 2, pb_sessions_week: 1.2, pb_cohort: 0, pb_cohort_active: 0, pb_pain: 0 },
];

const MODALITIES = [
  { mb_modality: 'musculacao', mb_users: 30, mb_with_plan: 25, mb_trained30: 18, mb_never: 4, mb_sessions_week: 2.8, mb_cohort: 10, mb_cohort_active: 6, mb_pain: 3 },
  { mb_modality: 'calistenia', mb_users: 8, mb_with_plan: 8, mb_trained30: 6, mb_never: 1, mb_sessions_week: 3.1, mb_cohort: 4, mb_cohort_active: 3, mb_pain: 0 },
];

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('trainingPatterns', () => {
  it('monta a grade 7×24 com níveis, pico, hora do lembrete e janela calma', () => {
    const h = buildHeatmap(HEAT);
    expect(h.total).toBe(14);
    expect(h.rows[1].cells[19]).toMatchObject({ sessions: 8, level: 4 });
    expect(h.rows[3].cells[7].level).toBe(1);
    expect(h.rows[0].cells[0].level).toBe(0);
    expect(h.peakCell.label).toBe('Seg 19h');
    expect(h.reminderHour).toBe(18);
    expect(h.quiet).toMatchObject({ start: 8, label: '08h às 11h' });
    expect(buildHeatmap([]).peakHour).toBeNull();
  });

  it('academia, condomínio e casa sempre aparecem, com as taxas', () => {
    const [gym, condo, home] = buildPlaces(PLACES);
    expect(gym).toMatchObject({ label: 'Academia', trained30Pct: 60, neverPct: 20, retentionPct: 75, painPct: 10 });
    expect(condo).toMatchObject({ label: 'Condomínio', users: 0 });
    expect(home).toMatchObject({ label: 'Em casa', retentionPct: null });
    expect(buildPlaces([]).map(p => p.users)).toEqual([0, 0, 0]);
  });
});

describe('modalidades', () => {
  it('musculação e calistenia sempre aparecem, com as taxas e a fatia do total', () => {
    const [gym, cali] = buildModalities(MODALITIES);
    expect(gym).toMatchObject({ label: 'Musculação', users: 30, sharePct: 79, trained30Pct: 60, retentionPct: 60, painPct: 10 });
    expect(cali).toMatchObject({ label: 'Calistenia', users: 8, sharePct: 21, trained30Pct: 75, neverPct: 13, sessionsWeek: 3.1 });
  });

  it('sem nenhum usuário não divide por zero', () => {
    const list = buildModalities([]);
    expect(list.map(m => m.users)).toEqual([0, 0]);
    expect(list.every(m => m.sharePct === null)).toBe(true);
  });

  it('fetchModalities devolve null se a RPC não existe (migration pendente)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('function admin_modality_breakdown does not exist') });
    expect(await fetchModalities()).toBeNull();
  });
});

describe('TrainingPatternsCard', () => {
  it('mostra a tabela de modalidades sem derrubar o restante', async () => {
    mockRpc.mockImplementation(async name => ({
      data: name === 'admin_training_heatmap' ? HEAT : name === 'admin_modality_breakdown' ? MODALITIES : PLACES, error: null,
    }));
    render(<MemoryRouter><TrainingPatternsCard /></MemoryRouter>);
    const row = (await screen.findByText('Calistenia')).closest('tr');
    expect(row.textContent).toContain('75%');
    expect(row.textContent).toContain('3.1');
    expect(screen.getByText('Seg 19h')).toBeTruthy();
  });

  it('sem a migration das modalidades, a tabela some e o resto segue funcionando', async () => {
    mockRpc.mockImplementation(async name => (
      name === 'admin_modality_breakdown'
        ? { data: null, error: new Error('function admin_modality_breakdown does not exist') }
        : { data: name === 'admin_training_heatmap' ? HEAT : PLACES, error: null }
    ));
    render(<MemoryRouter><TrainingPatternsCard /></MemoryRouter>);
    expect(await screen.findByText('Seg 19h')).toBeTruthy();
    expect(screen.queryByText('Musculação × calistenia')).toBeNull();
    expect(screen.getByText('Academia × em casa')).toBeTruthy();
  });

  it('mostra o mapa e a tabela por local', async () => {
    mockRpc.mockImplementation(async name => ({ data: name === 'admin_training_heatmap' ? HEAT : PLACES, error: null }));
    render(<MemoryRouter><TrainingPatternsCard /></MemoryRouter>);
    expect(await screen.findByText('Seg 19h')).toBeTruthy();
    expect(screen.getByText('18h')).toBeTruthy();
    expect(screen.getByTitle('Seg 19h: 8 treino(s)').className).toContain('heatgrid__cell--l4');
    expect(screen.getByText('Em casa').closest('tr').textContent).toContain('25%');
    expect(mockRpc).toHaveBeenCalledWith('admin_training_heatmap', { days_back: 90 });
  });

  it('erro aparece no card', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('function admin_place_breakdown does not exist') });
    render(<MemoryRouter><TrainingPatternsCard /></MemoryRouter>);
    expect(await screen.findByText('function admin_place_breakdown does not exist')).toBeTruthy();
  });
});
