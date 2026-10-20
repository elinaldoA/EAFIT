// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const { lib } = vi.hoisted(() => ({ lib: { fetchCosts: vi.fn(), saveCostPlan: vi.fn() } }));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => ({ adminUser: { id: 'adm1' } }) }));
vi.mock('../lib/costs', async orig => ({ ...(await orig()), ...lib }));

import Costs from './Costs';
import { METRICS, PLAN_PRESETS, estimateCost, normalizePlan, projectQuota } from '../lib/costs';

const GB = 1024 ** 3;
const usage = { dbBytes: 0.6 * GB, storageBytes: 0.2 * GB, storageObjects: 40, users: 900, mau: 300, push: 120 };
const snap = (day, db) => ({ day, dbBytes: db * GB, storageBytes: 0, storageObjects: 0, users: 0, mau: 0, push: 0 });

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('costs', () => {
  it('estima excedente e custo e projeta quando chega no limite', () => {
    const pro = normalizePlan({ ...PLAN_PRESETS.Pro, quotas: { dbGb: 0.5, storageGb: 100, mau: 100000 }, usdBrl: 5 });
    const est = estimateCost(usage, pro);
    const dbLine = est.lines.find(l => l.key === 'dbGb');
    expect(dbLine.pct).toBe(120);
    expect(dbLine.over).toBeCloseTo(0.1);
    expect(est.usd).toBeCloseTo(25.01, 2);
    expect(est.brl).toBeCloseTo(est.usd * 5, 1);
    expect(normalizePlan(null)).toMatchObject({ plan: 'Free', baseUsd: 0, quotas: { dbGb: 0.5 } });

    const db = METRICS[0];
    const p = projectQuota([snap('2026-10-01', 0.1), snap('2026-10-11', 0.2), snap('2026-10-21', 0.3)], db, 0.5);
    expect(p.perDay).toBeCloseTo(0.01);
    expect(p.daysToQuota).toBe(20);
    expect(projectQuota([snap('2026-10-01', 0.3), snap('2026-10-02', 0.3)], db, 0.5).daysToQuota).toBeNull();
    expect(projectQuota([snap('2026-10-01', 0.3)], db, 0.5)).toBeNull();
  });
});

describe('Costs', () => {
  it('mostra uso x plano e salva o plano Pro', async () => {
    lib.fetchCosts.mockResolvedValue({ usage, snapshots: [], plan: normalizePlan(null) });
    lib.saveCostPlan.mockResolvedValue();
    render(<Costs />);
    expect(await screen.findByText('Banco de dados')).toBeTruthy();
    expect(screen.getByText('120%')).toBeTruthy();
    expect(screen.getAllByText('poucos dias de histórico')).toHaveLength(3);

    fireEvent.change(screen.getByLabelText('Plano'), { target: { value: 'Pro' } });
    fireEvent.click(screen.getByText('Salvar plano'));
    await waitFor(() => expect(lib.saveCostPlan).toHaveBeenCalled());
    expect(lib.saveCostPlan.mock.calls[0][0]).toMatchObject({ plan: 'Pro', baseUsd: 25, quotas: { dbGb: 8 } });
    expect(lib.saveCostPlan.mock.calls[0][1]).toBe('adm1');
  });
});
