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

const app = [
  { page: 'app', status: 'ok', country: 'BR', uf: 'BA', region: 'Bahia', city: 'Salvador', visits: 4 },
];

const users = [
  { status: 'ok', country: 'BR', uf: 'SP', region: 'São Paulo', city: 'Campinas', sexo: 'F', faixa: '25–34', users: 3 },
  { status: 'ok', country: 'BR', uf: 'BA', region: 'Bahia', city: 'Salvador', sexo: 'M', faixa: '18–24', users: 1 },
];

beforeEach(() => {
  mockRpc.mockReset();
  mockRpc.mockImplementation(async name => ({
    data: { admin_user_geo: users, admin_app_geo: app }[name] ?? visits, error: null,
  }));
});

describe('GeoPanel', () => {
  it('em Tudo soma site e app, com estados, cidades e países', async () => {
    render(<GeoPanel />);
    expect(await screen.findByText('Estados')).toBeTruthy();
    expect(mockRpc).toHaveBeenCalledWith('admin_visit_geo', { days_back: 30 });
    expect(mockRpc).toHaveBeenCalledWith('admin_app_geo', { days_back: 30 });
    expect(screen.getByText(/1 aguardando localização/)).toBeTruthy();
    expect(screen.getAllByText('6 · 50%')).toHaveLength(2); // SP e BA: 6 de 12 cada no Brasil
    expect(document.querySelector('.card-note').textContent).toMatch(/Site: 9 · App: 6\./);
    expect(screen.getByText('Campinas · SP')).toBeTruthy();
    expect(screen.getByText('Lisboa · Lisbon · PT')).toBeTruthy();
    expect(screen.getByText(/Portugal/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bahia: 6 acessos' })).toBeTruthy();
  });

  it('Site mostra só a página de apresentação e App só tela de login + logados', async () => {
    render(<GeoPanel />);
    await screen.findByText('Estados');
    fireEvent.click(screen.getByRole('button', { name: 'Site' }));
    expect(await screen.findByRole('button', { name: 'São Paulo: 6 visitas' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bahia: 0 visitas' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'App' }));
    expect(await screen.findByRole('button', { name: 'Bahia: 6 acessos' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'São Paulo: 0 acessos' })).toBeTruthy();
  });

  it('clicar no estado filtra as cidades e volta pro Brasil todo', async () => {
    render(<GeoPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bahia: 6 acessos' }));
    expect(screen.getByText(/Bahia · 6 acessos/)).toBeTruthy();
    expect(screen.queryByText('Campinas · SP')).toBeNull();
    expect(screen.getByText('Salvador · BA')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ver o Brasil todo' }));
    expect(screen.getByText('Campinas · SP')).toBeTruthy();
  });

  it('Mundo pinta os países e clicar no país filtra as cidades', async () => {
    render(<GeoPanel />);
    await screen.findByText('Estados');
    expect(document.querySelector('.card-note').textContent).toMatch(/2 fora do Brasil \(veja em Mundo\)/);
    fireEvent.click(screen.getByRole('button', { name: 'Mundo' }));
    const pt = await screen.findByRole('button', { name: 'Portugal: 2 acessos' }, { timeout: 5000 }); // mapa carregado sob demanda
    expect(screen.getByRole('button', { name: 'Brasil: 12 acessos' })).toBeTruthy();
    expect(screen.queryByText('Estados')).toBeNull();
    fireEvent.click(pt);
    expect(screen.getByText(/Portugal · 2 acessos/)).toBeTruthy();
    expect(screen.getByText('Lisboa · Lisbon · PT')).toBeTruthy();
    expect(screen.queryByText('Campinas · SP')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver o mundo todo' }));
    expect(screen.getByText('Campinas · SP')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Brasil: 12 acessos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver por estado' }));
    expect(screen.getByText('Estados')).toBeTruthy();
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
