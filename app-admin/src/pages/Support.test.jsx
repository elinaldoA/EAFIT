// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockRpc, mockFrom, mockInvoke, upsert, update } = vi.hoisted(() => ({
  mockRpc: vi.fn(), mockFrom: vi.fn(), mockInvoke: vi.fn(), upsert: vi.fn(), update: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({ db: { rpc: mockRpc, from: mockFrom, functions: { invoke: mockInvoke } } }));
vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => ({ adminUser: { id: 'adm1' } }) }));

import Support from './Support';
import { ageHours, filterView, formatAge, mapItem } from '../lib/support';

const NOW = Date.now();
const row = over => ({
  sq_source: 'feedback', sq_id: 'f1', sq_created_at: new Date(NOW - 72 * 3600000).toISOString(), sq_kind: 'problema',
  sq_message: 'O app travou', sq_status: 'novo', sq_name: 'Ana', sq_email: 'ana@x.com', sq_account: 'u1',
  sq_assigned_to: null, sq_answered_at: null, sq_errors7: 2, sq_reply: null, ...over,
});
const QUEUE = [
  row(),
  row({ sq_source: 'contato', sq_id: 'c1', sq_kind: 'suporte', sq_message: 'Não entro', sq_status: 'em_andamento', sq_name: 'Caio', sq_email: 'c@x.com', sq_account: null, sq_assigned_to: 'adm1', sq_errors7: 0, sq_created_at: new Date(NOW - 2 * 3600000).toISOString() }),
];

beforeEach(() => {
  vi.clearAllMocks();
  upsert.mockResolvedValue({ error: null });
  update.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  mockFrom.mockReturnValue({ upsert, update });
  mockInvoke.mockResolvedValue({ data: { ok: true, emailSent: 1 }, error: null });
  mockRpc.mockImplementation(async name => ({
    data: {
      admin_support_queue: QUEUE,
      admin_support_stats: [{ ss_open: 2, ss_unassigned: 1, ss_old: 1, ss_answered30: 4, ss_median_hours: 5.5 }],
      admin_list_admin_accounts: [{ ad_user: 'adm1', ad_email: 'eu@x.com', ad_name: 'Eu' }, { ad_user: 'adm2', ad_email: 'bia@x.com', ad_name: 'Bia' }],
    }[name],
    error: null,
  }));
});
afterEach(cleanup);

describe('lib/support', () => {
  it('idade, filtro por responsável', () => {
    const items = QUEUE.map(mapItem);
    expect(ageHours(items[0], NOW)).toBe(72);
    expect([formatAge(0), formatAge(5), formatAge(72)]).toEqual(['agora', '5 h', '3 d']);
    expect(filterView(items, 'meus', 'adm1').map(i => i.id)).toEqual(['c1']);
    expect(filterView(items, 'sem_dono', 'adm1').map(i => i.id)).toEqual(['f1']);
  });
});

describe('Support', () => {
  it('mostra a fila com atraso, erros do app e números; pegar para si e resolver', async () => {
    render(<MemoryRouter><Support /></MemoryRouter>);
    expect(await screen.findByText('O app travou')).toBeTruthy();
    expect(screen.getByText('3 d').className).toContain('badge--danger');
    expect(screen.getByText('2 erro(s) no app em 7 dias')).toBeTruthy();
    expect(screen.getByText('5,5 h')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Responder por e-mail' }).getAttribute('href')).toMatch(/^mailto:c%40x\.com/);

    fireEvent.change(screen.getByLabelText('Responsável por Ana'), { target: { value: 'adm1' } });
    await waitFor(() => expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ source: 'feedback', item_id: 'f1', assigned_to: 'adm1', updated_by: 'adm1' })));
    expect(update).toHaveBeenCalledWith({ status: 'em_andamento' });

    fireEvent.click(screen.getAllByRole('button', { name: 'Resolver' })[1]);
    await waitFor(() => expect(update).toHaveBeenCalledWith({ status: 'respondido' }));
  });

  it('responde o feedback no app e resolve', async () => {
    render(<MemoryRouter><Support /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Responder' }));
    fireEvent.change(screen.getByLabelText('Resposta'), { target: { value: 'Corrigimos, atualize o app.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Responder e resolver' }));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('admin-broadcast', expect.objectContaining({
      body: expect.objectContaining({ body: 'Corrigimos, atualize o app.', targetUserIds: ['u1'], email: 'resposta' }),
    })));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ admin_reply: 'Corrigimos, atualize o app.', status: 'resolvido' }));
  });

  it('"Comigo" filtra e erro aparece', async () => {
    render(<MemoryRouter><Support /></MemoryRouter>);
    await screen.findByText('O app travou');
    fireEvent.click(screen.getByRole('button', { name: 'Comigo' }));
    expect(await screen.findByText('Não entro')).toBeTruthy();
    expect(screen.queryByText('O app travou')).toBeNull();
    cleanup();

    mockRpc.mockResolvedValue({ data: null, error: new Error('not_authorized') });
    render(<MemoryRouter><Support /></MemoryRouter>);
    expect(await screen.findByText('not_authorized')).toBeTruthy();
  });
});
