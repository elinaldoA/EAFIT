// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const { mockRpc, mockFrom, rows, insert, update } = vi.hoisted(() => ({
  mockRpc: vi.fn(), mockFrom: vi.fn(), rows: { value: [] }, insert: vi.fn(), update: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({ db: { rpc: mockRpc, from: mockFrom } }));
vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => ({ adminUser: { id: 'adm1' } }) }));

import Experiments from './Experiments';
import { buildExperimentRow, buildResults, rolloutVariants, significance } from '../lib/experiments';

const ROLLOUT = {
  key: 'desafios_gradual', name: 'Desafios aos poucos', description: '', kind: 'rollout', flag: 'desafios',
  variants: [{ key: 'on', weight: 20 }, { key: 'off', weight: 80 }], audience: 'todos', status: 'rodando',
  started_at: '2026-10-01T12:00:00Z', ended_at: null, winner: null, created_at: '2026-10-01T12:00:00Z',
};
const RESULTS = [
  { xr_variant: 'on', xr_users: 200, xr_opened: 150, xr_trained: 120, xr_train_days: 600, xr_new_users: 10, xr_new_activated: 6, xr_feature_users: 80, xr_days: 20 },
  { xr_variant: 'off', xr_users: 800, xr_opened: 500, xr_trained: 400, xr_train_days: 2000, xr_new_users: 40, xr_new_activated: 16, xr_feature_users: 0, xr_days: 20 },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  rows.value = [ROLLOUT];
  insert.mockResolvedValue({ error: null });
  update.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  mockFrom.mockReturnValue({
    select: () => ({ order: async () => ({ data: rows.value, error: null }) }),
    insert, update,
  });
  mockRpc.mockResolvedValue({ data: RESULTS, error: null });
});
afterEach(cleanup);

describe('lib/experiments', () => {
  it('valida o formulário: pesos somando 100, chaves e funcionalidade', () => {
    expect(buildExperimentRow({ key: 'X!', name: 'a' }).error).toMatch(/Chave/);
    expect(buildExperimentRow({ key: 'onb', name: 'Onb', kind: 'ab', audience: 'todos', variants: [{ key: 'a', weight: 60 }, { key: 'b', weight: 30 }] }).error).toBe('Os pesos precisam somar 100.');
    expect(buildExperimentRow({ key: 'onb', name: 'Onb', kind: 'ab', audience: 'todos', variants: [{ key: 'a', weight: 50 }, { key: 'a', weight: 50 }] }).error).toMatch(/diferentes/);
    expect(buildExperimentRow({ key: 'des', name: 'Des', kind: 'rollout', flag: 'desafios', onPct: 25, audience: 'novos' }).row)
      .toEqual({ key: 'des', name: 'Des', description: '', kind: 'rollout', flag: 'desafios', variants: [{ key: 'on', weight: 25 }, { key: 'off', weight: 75 }], audience: 'novos' });
    expect(rolloutVariants(130)).toEqual([{ key: 'on', weight: 100 }, { key: 'off', weight: 0 }]);
  });

  it('resultados com a diferença contra a referência e o teste de proporções', () => {
    const r = buildResults(ROLLOUT, RESULTS);
    const [on, off] = r.variants;
    expect(on).toMatchObject({ trainedPct: 60, openedPct: 75, daysPerWeek: 1.1, activationPct: 60, featurePct: 40 });
    expect(off).toMatchObject({ trainedPct: 50, liftPct: -10 });
    expect(off.vsBase.significant).toBe(true);
    expect(significance(5, 10, 6, 10).significant).toBe(false);
    expect(significance(0, 0, 1, 1)).toBeNull();
  });
});

describe('Experiments', () => {
  it('mostra o experimento rodando com resultados e ajusta o percentual', async () => {
    render(<Experiments />);
    expect(await screen.findByText('Desafios aos poucos')).toBeTruthy();
    expect(await screen.findByText('significativa (95%)')).toBeTruthy();
    expect(screen.getByText('Ligada')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Ajustar percentual'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ variants: [{ key: 'on', weight: 50 }, { key: 'off', weight: 50 }] }));

    fireEvent.click(screen.getByRole('button', { name: 'Encerrar: ligada vence' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ status: 'encerrado', winner: 'on' }));
  });

  it('cria um teste A/B como rascunho', async () => {
    rows.value = [];
    render(<Experiments />);
    expect(await screen.findByText('Nenhum experimento ainda.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Novo experimento' }));
    fireEvent.click(screen.getByRole('button', { name: 'Teste A/B' }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Onboarding curto' } });
    fireEvent.change(screen.getByLabelText('Chave (o código do app lê por ela)'), { target: { value: 'onb_curto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar como rascunho' }));
    await waitFor(() => expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      key: 'onb_curto', kind: 'ab', flag: null, variants: [{ key: 'a', weight: 50 }, { key: 'b', weight: 50 }], created_by: 'adm1',
    })));
  });
});
