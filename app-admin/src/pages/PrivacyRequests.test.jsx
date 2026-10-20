// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockRpc, mockFrom, insert, update, rows } = vi.hoisted(() => ({
  mockRpc: vi.fn(), mockFrom: vi.fn(), insert: vi.fn(), update: vi.fn(), rows: { value: [] },
}));
vi.mock('../lib/supabase', () => ({ db: { rpc: mockRpc, from: mockFrom } }));
vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => ({ adminUser: { id: 'adm1' } }) }));

import PrivacyRequests from './PrivacyRequests';
import { createRequest, daysLeft, dueFrom } from '../lib/privacy';

const DAY = 86400000;
const NOW = Date.now();
const REQ = over => ({
  id: 1, user_id: 'u1', email: 'ana@x.com', kind: 'acesso', status: 'aberto', channel: 'email',
  received_at: new Date(NOW - 17 * DAY).toISOString(), due_at: new Date(NOW - 2 * DAY).toISOString(), notes: '', resolved_at: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  rows.value = [REQ(), REQ({ id: 2, user_id: null, email: 'b@x.com', kind: 'exclusao', due_at: new Date(NOW + 2 * DAY).toISOString() })];
  insert.mockResolvedValue({ error: null });
  update.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  const order2 = { limit: async () => ({ data: rows.value, error: null }) };
  mockFrom.mockReturnValue({ select: () => ({ order: () => ({ order: () => order2 }) }), insert, update });
  mockRpc.mockResolvedValue({ data: [{ fu_user: 'u9', fu_name: 'Caio', fu_created: '2026-01-01' }], error: null });
});
afterEach(cleanup);

describe('lib/privacy', () => {
  it('prazo de 15 dias e dias restantes', () => {
    expect(dueFrom('2026-10-01').slice(0, 10)).toBe('2026-10-16');
    expect(daysLeft(REQ(), NOW)).toBe(-2);
    expect(daysLeft(REQ({ status: 'concluido' }), NOW)).toBeNull();
  });

  it('cria o pedido ligado à conta pelo e-mail', async () => {
    await expect(createRequest({ email: 'nada' }, 'adm1')).rejects.toThrow('E-mail inválido.');
    await createRequest({ email: ' Caio@X.com ', kind: 'acesso', channel: 'email', receivedOn: '2026-10-01', notes: ' x ' }, 'adm1');
    expect(mockRpc).toHaveBeenCalledWith('admin_find_user_by_email', { p_email: 'caio@x.com' });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ email: 'caio@x.com', user_id: 'u9', notes: 'x', created_by: 'adm1' }));
  });
});

describe('PrivacyRequests', () => {
  it('lista com prazo vencido, atalho para a ficha e troca de situação', async () => {
    render(<MemoryRouter><PrivacyRequests /></MemoryRouter>);
    expect(await screen.findByText('vencido há 2 dia(s)')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Baixar dados na ficha' }).getAttribute('href')).toBe('/users/u1');
    expect(screen.getByText('sem conta no app')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Situação do pedido de ana@x.com'), { target: { value: 'concluido' } });
    await waitFor(() => expect(update).toHaveBeenCalledWith({ status: 'concluido' }));
  });

  it('registra um pedido novo', async () => {
    rows.value = [];
    render(<MemoryRouter><PrivacyRequests /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar pedido' }));
    fireEvent.change(screen.getByLabelText('E-mail de quem pediu'), { target: { value: 'caio@x.com' } });
    fireEvent.change(screen.getByLabelText('Pedido'), { target: { value: 'portabilidade' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(insert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'portabilidade', user_id: 'u9' })));
  });
});
