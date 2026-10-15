// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock('../lib/supabase', () => ({ db: { rpc: mockRpc } }));

import GeoPanel from './GeoPanel';

const visits = [
  { page: 'landing', status: 'ok', country: 'BR', uf: 'SP', region: 'São Paulo', city: 'Campinas', visits: 6 },
  { page: 'acesso', status: 'ok', country: 'BR', uf: 'BA', region: 'Bahia', city: 'Salvador', visits: 2 },
  { page: 'landing', status: 'ok', country: 'PT', uf: null, region: 'Lisbon', city: 'Lisboa', visits: 2 },
  { page: 'landing', status: 'pendente', country: null, uf: null, region: null, city: null, visits: 1 },
];

const users = [
  { status: 'ok', country: 'BR', uf: 'SP', region: 'São Paulo', city: 'Campinas', sexo: 'F', faixa: '25–34', users: 3 },
  { status: 'ok', country: 'BR', uf: 'BA', region: 'Bahia', city: 'Salvador', sexo: 'M', faixa: '18–24', users: 1 },
];

beforeEach(() => {
  mockRpc.mockReset();
  mockRpc.mockImplementation(async name => ({ data: name === 'admin_user_geo' ? users : visits, error: null }));
});

describe('GeoPanel', () => {
  it('mostra resumo, estados, cidades e países das visitas', async () => {
    render(<GeoPanel />);
    expect(await screen.findByText('Estados')).toBeTruthy();
    expect(mockRpc).toHaveBeenCalledWith('admin_visit_geo', { days_back: 30 });
    expect(screen.getByText(/1 aguardando localização/)).toBeTruthy();
    expect(screen.getByText('6 · 75%')).toBeTruthy(); // SP: 6 de 8 no Brasil
    expect(screen.getByText('Campinas · SP')).toBeTruthy();
    expect(screen.getByText('Lisboa · Lisbon · PT')).toBeTruthy();
    expect(screen.getByText(/Portugal/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'São Paulo: 6 visitas' })).toBeTruthy();
  });

  it('clicar no estado filtra as cidades e volta pro Brasil todo', async () => {
    render(<GeoPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bahia: 2 visitas' }));
    expect(screen.getByText(/Bahia · 2 visitas/)).toBeTruthy();
    expect(screen.queryByText('Campinas · SP')).toBeNull();
    expect(screen.getByText('Salvador · BA')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ver o Brasil todo' }));
    expect(screen.getByText('Campinas · SP')).toBeTruthy();
  });

  it('no modo Contas mostra sexo e faixa etária', async () => {
    render(<GeoPanel />);
    await screen.findByText('Estados');
    fireEvent.click(screen.getByRole('button', { name: 'Contas' }));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('admin_user_geo', { days_back: 30 }));
    expect(await screen.findByText('Feminino')).toBeTruthy();
    expect(screen.getByText('Faixa etária')).toBeTruthy();
    expect(screen.getByText('25–34')).toBeTruthy();
  });

  it('mostra o erro da consulta', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('not_authorized') });
    render(<GeoPanel />);
    expect(await screen.findByText('not_authorized')).toBeTruthy();
  });
});
