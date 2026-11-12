// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { lib } = vi.hoisted(() => ({
  lib: { fetchAmbassadors: vi.fn(), fetchReferrals: vi.fn(), createAmbassador: vi.fn(), updateAmbassador: vi.fn(), sendProgramMessage: vi.fn() },
}));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/ambassadors', async orig => ({ ...(await orig()), ...lib }));
vi.mock('../components/PromoMaterialsAdmin', () => ({ default: () => null }));

import Ambassadors from './Ambassadors';

const row = (over = {}) => ({
  id: 'a1', userId: 'u1', email: 'ana@x.com', name: 'Ana Souza', code: 'anasouza', active: true,
  createdAt: '2026-10-01T10:00:00Z', kind: 'embaixador', visits: 10, signups: 4, total: 6, active7: 2, lastSignup: null, ...over,
});
const ROWS = [
  row(),
  row({ id: 'a2', userId: 'u2', email: 'bia@x.com', name: 'Bia Fit', code: 'biafit', kind: 'influenciador', visits: 30, signups: 9, total: 12, active7: 5 }),
];

const wrap = () => render(<MemoryRouter><Ambassadors /></MemoryRouter>);
const tile = label => screen.getByText(label).parentElement.querySelector('.tile__value').textContent;

beforeEach(() => {
  vi.clearAllMocks();
  lib.fetchAmbassadors.mockResolvedValue(ROWS);
  lib.fetchReferrals.mockResolvedValue([]);
  lib.createAmbassador.mockResolvedValue(undefined);
  lib.updateAmbassador.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('Ambassadors — lista e totais', () => {
  it('lista os parceiros e soma visitas, contas, vinculados e ativos', async () => {
    wrap();
    expect(await screen.findByText('Ana Souza')).toBeTruthy();
    expect(screen.getByText('Bia Fit')).toBeTruthy();
    expect(lib.fetchAmbassadors).toHaveBeenCalledWith(30);
    expect(tile('Visitas pelos links no período')).toBe('40');
    expect(tile('Contas criadas no período')).toBe('13');
    expect(tile('Vinculados no total')).toBe('18');
    expect(tile('Vinculados ativos (7 dias)')).toBe('7');
  });

  it('o filtro por tipo recalcula a lista e os totais', async () => {
    wrap();
    await screen.findByText('Ana Souza');
    fireEvent.click(screen.getByRole('button', { name: 'Influenciadores' }));
    expect(screen.queryByText('Ana Souza')).toBeNull();
    expect(screen.getByText('Bia Fit')).toBeTruthy();
    expect(tile('Visitas pelos links no período')).toBe('30');
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    expect(screen.getByText('Ana Souza')).toBeTruthy();
    expect(tile('Visitas pelos links no período')).toBe('40');
  });

  it('trocar o período busca de novo com a nova janela (0 = tudo)', async () => {
    wrap();
    await screen.findByText('Ana Souza');
    fireEvent.click(screen.getByRole('button', { name: '7 dias' }));
    await waitFor(() => expect(lib.fetchAmbassadors).toHaveBeenLastCalledWith(7));
    fireEvent.click(screen.getByRole('button', { name: 'Tudo' }));
    await waitFor(() => expect(lib.fetchAmbassadors).toHaveBeenLastCalledWith(0));
  });

  it('sem ninguém no programa mostra o estado vazio', async () => {
    lib.fetchAmbassadors.mockResolvedValue([]);
    wrap();
    expect(await screen.findByText('Nenhum embaixador ainda.')).toBeTruthy();
  });

  it('mostra o erro quando a consulta falha', async () => {
    lib.fetchAmbassadors.mockRejectedValue(new Error('not_authorized'));
    wrap();
    expect(await screen.findByText('not_authorized')).toBeTruthy();
  });
});

describe('Ambassadors — adicionar ao programa', () => {
  const fill = () => {
    fireEvent.change(screen.getByPlaceholderText('pessoa@exemplo.com'), { target: { value: 'carla@x.com' } });
    fireEvent.change(screen.getByPlaceholderText('Ex.: Ana Souza'), { target: { value: 'Carla Méndez' } });
  };

  it('sugere o código a partir do nome (sem acento) e mostra o link', async () => {
    wrap();
    await screen.findByText('Ana Souza');
    fill();
    expect(screen.getByPlaceholderText('anasouza').value).toBe('carlamendez');
    expect(screen.getByText('https://eafit.com.br/app/?ref=carlamendez')).toBeTruthy();
  });

  it('só libera o botão com um código válido', async () => {
    wrap();
    await screen.findByText('Ana Souza');
    const btn = screen.getByRole('button', { name: 'Criar embaixador' });
    expect(btn.disabled).toBe(true);
    fill();
    expect(btn.disabled).toBe(false);
    fireEvent.change(screen.getByPlaceholderText('anasouza'), { target: { value: 'ab' } }); // curto demais
    expect(btn.disabled).toBe(true);
  });

  it('cria, avisa com o link e recarrega a lista', async () => {
    wrap();
    await screen.findByText('Ana Souza');
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Criar embaixador' }));
    expect(await screen.findByText(/Embaixador criado\. Link: https:\/\/eafit\.com\.br\/app\/\?ref=carlamendez/)).toBeTruthy();
    expect(lib.createAmbassador).toHaveBeenCalledWith(expect.objectContaining({ email: 'carla@x.com', name: 'Carla Méndez', code: 'carlamendez', kind: 'embaixador' }));
    await waitFor(() => expect(lib.fetchAmbassadors).toHaveBeenCalledTimes(2));
  });

  it('trocar o tipo muda o texto do botão e vai junto na criação', async () => {
    wrap();
    await screen.findByText('Ana Souza');
    // 'Tipo' também nomeia o grupo de filtros: o campo do formulário é o <select>
    fireEvent.change(screen.getAllByLabelText('Tipo').find(el => el.tagName === 'SELECT'), { target: { value: 'influenciador' } });
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Criar influenciador' }));
    await waitFor(() => expect(lib.createAmbassador).toHaveBeenCalledWith(expect.objectContaining({ kind: 'influenciador' })));
  });

  it('mostra o erro do banco e não limpa o que foi digitado', async () => {
    lib.createAmbassador.mockRejectedValue(new Error('code_taken'));
    wrap();
    await screen.findByText('Ana Souza');
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Criar embaixador' }));
    expect(await screen.findByText('Erro: code_taken')).toBeTruthy();
    expect(screen.getByPlaceholderText('pessoa@exemplo.com').value).toBe('carla@x.com');
  });
});

describe('Ambassadors — cartão do parceiro', () => {
  it('abre as contas indicadas ao tocar no cartão', async () => {
    lib.fetchReferrals.mockResolvedValue([{ userId: 'u9', email: 'novo@x.com', name: 'Novo Aluno', source: 'instagram', linkedAt: '2026-10-05T10:00:00Z', confirmed: true, lastSeen: null, workouts: 3 }]);
    wrap();
    await screen.findByText('Ana Souza');
    const card = screen.getByText('Ana Souza').closest('li');
    const toggle = within(card).getAllByRole('button')[0];
    fireEvent.click(toggle);
    await waitFor(() => expect(lib.fetchReferrals).toHaveBeenCalledWith('a1'));
  });
});
