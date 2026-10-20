// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock('../lib/supabase', () => ({ db: { rpc: mockRpc } }));

import ContentRanking from './ContentRanking';
import { buildExerciseRanking, buildPlanRanking, buildQualityQueue } from '../lib/contentRanking';

const EX = [
  { er_name: 'Supino Reto com Barra', er_in_plans: 4, er_planned: 10, er_done: 9, er_users: 4, er_swapped_out: 0, er_swapped_in: 1, er_pain: 0 },
  { er_name: 'Crucifixo Máquina', er_in_plans: 3, er_planned: 8, er_done: 2, er_users: 2, er_swapped_out: 3, er_swapped_in: 0, er_pain: 2 },
  { er_name: 'Raro', er_in_plans: 1, er_planned: 2, er_done: 0, er_users: 0, er_swapped_out: 0, er_swapped_in: 0, er_pain: 0 },
];
const PLANS = [{ pr_name: 'Hipertrofia A', pr_plans: 3, pr_users: 3, pr_by_trainer: 1, pr_planned: 40, pr_done: 30, pr_finished: 2, pr_finished_active: 1 }];
const QUALITY = [
  { lq_name: 'Supino Reto com Barra', lq_group: 'Peito', lq_type: 'composto', lq_post: false, lq_in_plans: 4, lq_custom_media: false, lq_no_equipment: false, lq_short_tech: false },
  { lq_name: 'Exercício Inventado', lq_group: 'Costas', lq_type: 'isolado', lq_post: false, lq_in_plans: 2, lq_custom_media: false, lq_no_equipment: true, lq_short_tech: true },
  { lq_name: 'Corrida', lq_group: 'Cardio', lq_type: 'cardio', lq_post: false, lq_in_plans: 0, lq_custom_media: true, lq_no_equipment: true, lq_short_tech: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockRpc.mockImplementation(async name => ({
    data: { admin_exercise_ranking: EX, admin_plan_ranking: PLANS, admin_library_quality: QUALITY }[name], error: null,
  }));
});
afterEach(cleanup);

describe('contentRanking', () => {
  it('ranqueia feitos, pulados (com amostra mínima), trocados e dor', () => {
    const r = buildExerciseRanking(EX);
    expect(r.mostDone.map(i => i.name)).toEqual(['Supino Reto com Barra', 'Crucifixo Máquina']);
    expect(r.mostSkipped.map(i => [i.name, i.skipPct])).toEqual([['Crucifixo Máquina', 75], ['Supino Reto com Barra', 10]]);
    expect(r.mostSwapped.map(i => i.name)).toEqual(['Crucifixo Máquina']);
    expect(r.mostPain[0]).toMatchObject({ name: 'Crucifixo Máquina', pain: 2 });
  });

  it('planos com aderência e quem chegou ao fim treinando', () => {
    expect(buildPlanRanking(PLANS)[0]).toMatchObject({ adherencePct: 75, finishedActivePct: 50, byTrainer: 1 });
  });

  it('fila: demonstração padrão do app conta, cardio não cobra equipamento', () => {
    const q = buildQualityQueue(QUALITY);
    expect(q.queue.map(i => [i.name, i.issues])).toEqual([['Exercício Inventado', ['no_media', 'no_equipment', 'short_tech']]]);
    expect(q.completePct).toBe(67);
    expect(q.counts).toEqual({ no_media: 1, no_equipment: 1, short_tech: 1 });
  });
});

describe('ContentRanking', () => {
  it('mostra rankings, planos e a fila com filtro', async () => {
    render(<MemoryRouter><ContentRanking /></MemoryRouter>);
    expect(await screen.findByText('Hipertrofia A')).toBeTruthy();
    expect(screen.getByText('Hipertrofia A').closest('tr').textContent).toContain('75%');
    expect(screen.getByText('Exercício Inventado')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Subir demonstração' }).getAttribute('href')).toBe('/demonstracoes');

    fireEvent.click(screen.getByRole('button', { name: 'Técnica curta' }));
    expect(screen.getByText('Exercício Inventado')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '90 dias' }));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('admin_exercise_ranking', { days_back: 90 }));
    expect(mockRpc).toHaveBeenCalledWith('admin_plan_ranking', { days_back: 90 });
  });

  it('erro aparece na tela', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('not_authorized') });
    render(<MemoryRouter><ContentRanking /></MemoryRouter>);
    expect(await screen.findByText('not_authorized')).toBeTruthy();
  });
});
