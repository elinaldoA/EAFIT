// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const { mockRpc, mockFrom, setting, upsert, auditInsert } = vi.hoisted(() => ({
  mockRpc: vi.fn(), mockFrom: vi.fn(), setting: { value: null }, upsert: vi.fn(), auditInsert: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({ db: { rpc: mockRpc, from: mockFrom } }));
vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => ({ adminUser: { id: 'adm1' } }) }));

import PushCapCard from './PushCapCard';
import { buildLoad, normalizeCap } from '../lib/pushCap';

const LOAD = [{ nl_count: 1, nl_users: 6 }, { nl_count: 3, nl_users: 3 }, { nl_count: 5, nl_users: 1 }];

beforeEach(() => {
  vi.clearAllMocks();
  setting.value = { maxPerWeek: 4 };
  upsert.mockResolvedValue({ error: null });
  auditInsert.mockResolvedValue({ error: null });
  mockRpc.mockResolvedValue({ data: LOAD, error: null });
  mockFrom.mockImplementation(table => (table === 'app_settings'
    ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: setting.value ? { value: setting.value } : null, error: null }) }) }), upsert }
    : { insert: auditInsert }));
});
afterEach(cleanup);

describe('pushCap', () => {
  it('normaliza o limite e calcula quem já estaria no teto', () => {
    expect([normalizeCap({ maxPerWeek: 3 }), normalizeCap({ maxPerWeek: 0 }), normalizeCap({ maxPerWeek: 51 }), normalizeCap(null)]).toEqual([3, 0, 0, 0]);
    expect(buildLoad(LOAD, 3)).toMatchObject({ total: 10, atCap: 4, max: 5, avg: 2 });
    expect(buildLoad(LOAD, 0).atCap).toBe(0);
  });
});

describe('PushCapCard', () => {
  it('mostra o limite atual e a distribuição, simula outro teto e salva', async () => {
    render(<PushCapCard />);
    expect(await screen.findByText('Atual: 4 por semana')).toBeTruthy();
    expect(screen.getByText(/já estariam no limite/).textContent).toContain('1');
    fireEvent.change(screen.getByLabelText('Máximo de avisos por semana'), { target: { value: '3' } });
    expect(screen.getByText(/já estariam no limite/).closest('p').textContent).toContain('Com teto de 3, 4 pessoa(s)');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.getByText(/Salvo: no máximo 3/)).toBeTruthy());
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ key: 'push_cap', value: { maxPerWeek: 3 }, updated_by: 'adm1' }));
  });

  it('vazio = sem limite; número inválido bloqueia o botão', async () => {
    setting.value = null;
    render(<PushCapCard />);
    expect(await screen.findByText('Atual: sem limite')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Máximo de avisos por semana'), { target: { value: '2.5' } });
    expect(screen.getByText(/Use um número inteiro/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Salvar' }).disabled).toBe(true);
  });
});
