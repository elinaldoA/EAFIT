// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockRpc, mockDownload } = vi.hoisted(() => ({ mockRpc: vi.fn(), mockDownload: vi.fn() }));
vi.mock('../lib/supabase', () => ({ db: { rpc: mockRpc } }));
vi.mock('../lib/csv', async orig => ({ ...(await orig()), downloadCsv: mockDownload }));

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

// Atual × anterior: SP 6/3, BA 6/4 (app 4/4 + tela de acesso 2/0), PT 2/4.
const compare = [
  { page: 'landing', country: 'BR', uf: 'SP', cur: 6, prev: 3 },
  { page: 'app', country: 'BR', uf: 'BA', cur: 4, prev: 4 },
  { page: 'acesso', country: 'BR', uf: 'BA', cur: 2, prev: 0 },
  { page: 'landing', country: 'PT', uf: null, cur: 2, prev: 4 },
];

const calls = name => mockRpc.mock.calls.filter(c => c[0] === name).length;

beforeEach(() => {
  mockRpc.mockReset();
  mockDownload.mockReset();
  mockRpc.mockImplementation(async name => ({
    data: { admin_user_geo: users, admin_app_geo: app, admin_geo_period_compare: compare }[name] ?? visits, error: null,
  }));
});

describe('GeoPanel', () => {
  it('em Tudo soma site e app, com estados, cidades e países', async () => {
    render(<GeoPanel />);
    expect(await screen.findByText('Estados')).toBeTruthy();
    expect(mockRpc).toHaveBeenCalledWith('admin_visit_geo', { days_back: 30 });
    expect(mockRpc).toHaveBeenCalledWith('admin_app_geo', { days_back: 30 });
    expect(screen.getByText(/1 aguardando localização/)).toBeTruthy();
    expect(screen.getAllByText('6 · 50%')).toHaveLength(4); // SP e BA: 6 de 12 cada no Brasil, e as regiões Sudeste e Nordeste iguais
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

  it('mostra a variação em relação ao período anterior', async () => {
    render(<GeoPanel />);
    await screen.findByText('Estados');
    expect(await screen.findByText('↑ 27%')).toBeTruthy(); // total: 14 contra 11
    expect(screen.getAllByText('↑ 100%')).toHaveLength(2); // SP: 6 contra 3 (e a região Sudeste)
    expect(screen.getAllByText('↑ 50%')).toHaveLength(2); // BA: 6 contra 4 (e a região Nordeste)
    expect(screen.getByText('↓ 50%')).toBeTruthy(); // PT: 2 contra 4
    expect(mockRpc).toHaveBeenCalledWith('admin_geo_period_compare', { days_back: 30 });
  });

  it('segue funcionando sem a comparação', async () => {
    mockRpc.mockImplementation(async name => (name === 'admin_geo_period_compare'
      ? { data: null, error: new Error('function not found') }
      : { data: { admin_app_geo: app }[name] ?? visits, error: null }));
    render(<GeoPanel />);
    expect(await screen.findByText('Estados')).toBeTruthy();
    expect(screen.queryByText('function not found')).toBeNull();
    expect(screen.queryByText(/↑/)).toBeNull();
  });

  it('trocar Tudo/Site/App não consulta de novo e mantém o estado escolhido', async () => {
    render(<GeoPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Bahia: 6 acessos' }));
    expect(document.querySelector('.geo-place-split').textContent).toBe('Site: 0 · App: 6'); // tela de acesso conta como app
    fireEvent.click(screen.getByRole('button', { name: 'App' }));
    expect(await screen.findByText(/Bahia · 6 acessos/)).toBeTruthy();
    expect(screen.getByText('Cidades em Bahia')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Site' }));
    expect(await screen.findByText(/Bahia · 0 visitas/)).toBeTruthy();
    expect(calls('admin_visit_geo')).toBe(1);
    expect(calls('admin_app_geo')).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: '7 dias' }));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('admin_visit_geo', { days_back: 7 }));
    fireEvent.click(screen.getByRole('button', { name: '30 dias' }));
    expect(calls('admin_visit_geo')).toBe(2);
  });

  it('Atualizar consulta de novo', async () => {
    render(<GeoPanel />);
    await screen.findByText('Estados');
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    await waitFor(() => expect(calls('admin_visit_geo')).toBe(2));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar' }).disabled).toBe(false));
  });

  it('lista todas as cidades sob demanda', async () => {
    const many = Array.from({ length: 12 }, (_, i) => (
      { page: 'landing', status: 'ok', country: 'BR', uf: 'SP', region: 'São Paulo', city: `Cidade ${String(i).padStart(2, '0')}`, visits: 20 - i }
    ));
    mockRpc.mockImplementation(async name => ({ data: name === 'admin_visit_geo' ? many : [], error: null }));
    render(<GeoPanel />);
    await screen.findByText('Estados');
    expect(screen.queryByText('Cidade 11 · SP')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver todas as 12 cidades' }));
    expect(screen.getByText('Cidade 11 · SP')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar menos' }));
    expect(screen.queryByText('Cidade 11 · SP')).toBeNull();
  });

  it('exporta estados, países e cidades em CSV com a variação', async () => {
    render(<GeoPanel />);
    await screen.findByText('↑ 27%');
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    const [name, csv] = mockDownload.mock.calls[0];
    expect(name).toBe('localizacao_tudo_30d.csv');
    expect(csv.split('\n')[0]).toBe('Tipo,Local,acessos,%,30 dias anteriores,Variação');
    expect(csv).toContain('Estado,São Paulo,6,50,3,↑ 100%');
    expect(csv).toContain('País,Portugal,2,14,4,↓ 50%');
    expect(csv).toContain('Cidade,Salvador · BA · BR,6');
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
