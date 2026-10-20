// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ api: {} }));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/trainerRequest', async (importActual) => ({
  ...(await importActual()),
  fetchMyTrainerRequest: (...a) => h.api.fetchMyTrainerRequest(...a),
  requestTrainerAccess: (...a) => h.api.requestTrainerAccess(...a),
}));

import ProfileTrainerRequestSection from './ProfileTrainerRequestSection';
import { friendlyTrainerRequestError, normalizeCref } from '../lib/trainerRequest';

beforeEach(() => {
  h.api = { fetchMyTrainerRequest: vi.fn(), requestTrainerAccess: vi.fn().mockResolvedValue() };
});
afterEach(cleanup);

describe('trainerRequest', () => {
  it('normaliza o CREF igual ao banco e traduz os erros', () => {
    expect(normalizeCref('12345 g sp')).toBe('012345-G/SP');
    expect(normalizeCref('012345-G/SP')).toBe('012345-G/SP');
    expect(normalizeCref('999/p/rj')).toBe('000999-P/RJ');
    expect(normalizeCref('1234567-G/SP')).toBeNull();
    expect(normalizeCref('abc')).toBeNull();
    expect(friendlyTrainerRequestError(new Error('already_pending'))).toBe('Você já tem um pedido em análise.');
  });
});

describe('ProfileTrainerRequestSection', () => {
  it('envia o pedido com o CREF normalizado e mostra a análise', async () => {
    h.api.fetchMyTrainerRequest.mockResolvedValueOnce(null).mockResolvedValue({ status: 'pendente', cref: '012345-G/SP' });
    const toast = vi.fn();
    render(<ProfileTrainerRequestSection toast={toast} />);
    fireEvent.change(await screen.findByLabelText('Nome completo (como no CREF)'), { target: { value: 'Ana Souza' } });
    fireEvent.change(screen.getByLabelText('CREF'), { target: { value: 'xx' } });
    fireEvent.click(screen.getByText('Pedir acesso de personal'));
    expect(screen.getByRole('alert').textContent).toMatch(/CREF inválido/);

    fireEvent.change(screen.getByLabelText('CREF'), { target: { value: '12345 g sp' } });
    fireEvent.click(screen.getByText('Pedir acesso de personal'));
    await waitFor(() => expect(h.api.requestTrainerAccess).toHaveBeenCalledWith('Ana Souza', '012345-G/SP', ''));
    expect(await screen.findByText(/Pedido em análise \(CREF 012345-G\/SP\)/)).toBeTruthy();
    expect(toast).toHaveBeenCalled();
  });

  it('mostra o motivo da recusa e quem já é personal', async () => {
    h.api.fetchMyTrainerRequest.mockResolvedValue({ status: 'recusado', reason: 'CREF não encontrado.' });
    render(<ProfileTrainerRequestSection />);
    expect(await screen.findByText(/não foi aprovado: CREF não encontrado/)).toBeTruthy();
    expect(screen.getByText('Pedir acesso de personal')).toBeTruthy();
    cleanup();
    h.api.fetchMyTrainerRequest.mockResolvedValue({ status: 'personal' });
    render(<ProfileTrainerRequestSection />);
    expect(await screen.findByText(/já está liberado/)).toBeTruthy();
  });
});
