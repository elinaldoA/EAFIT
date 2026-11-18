// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { lib } = vi.hoisted(() => ({ lib: { fetchFoodCatalogAdmin: vi.fn(), saveFood: vi.fn(), deleteFood: vi.fn() } }));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/foodCatalog', async orig => ({ ...(await orig()), ...lib }));

import FoodCatalog from './FoodCatalog';

const row = (over = {}) => ({ id: 'f1', name: 'Pamonha', icon: '🌽', category: 'Pratos', portion_g: 120, kcal: 200, protein_g: 5, carbs_g: 30, fat_g: 7, active: true, estimated: false, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  window.scrollTo = vi.fn();
  lib.fetchFoodCatalogAdmin.mockResolvedValue([row(), row({ id: 'f2', name: 'Pudim', category: 'Doces', active: false, estimated: true })]);
  lib.saveFood.mockResolvedValue();
  lib.deleteFood.mockResolvedValue();
});

describe('FoodCatalog', () => {
  it('lista os alimentos com situação e filtra', async () => {
    render(<FoodCatalog />);
    expect(await screen.findByText(/Pamonha/)).toBeTruthy();
    expect(screen.getByText('inativo')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Situação'), { target: { value: 'inativos' } });
    expect(screen.queryByText(/Pamonha/)).toBeNull();
    expect(screen.getByText(/Pudim/)).toBeTruthy();
  });

  it('cria um alimento válido e recarrega', async () => {
    render(<FoodCatalog />);
    await screen.findByText(/Pamonha/);
    fireEvent.click(screen.getByText('Novo alimento'));
    fireEvent.change(screen.getByLabelText(/^Nome/), { target: { value: 'Tapioca recheada' } });
    fireEvent.change(screen.getByLabelText(/Calorias/), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText(/Proteína/), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/Carboidratos/), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText(/Gorduras/), { target: { value: '7' } });
    fireEvent.click(screen.getByText('Criar alimento'));
    await waitFor(() => expect(lib.saveFood).toHaveBeenCalledWith(undefined, expect.objectContaining({ name: 'Tapioca recheada', kcal: 200 })));
    expect(await screen.findByText(/Salvo/)).toBeTruthy();
  });

  it('não salva com dados inválidos', async () => {
    render(<FoodCatalog />);
    await screen.findByText(/Pamonha/);
    fireEvent.click(screen.getByText('Novo alimento'));
    fireEvent.click(screen.getByText('Criar alimento'));
    expect(await screen.findByText('Informe o nome.')).toBeTruthy();
    expect(lib.saveFood).not.toHaveBeenCalled();
  });

  it('exclui depois de confirmar e mostra o erro de carregamento', async () => {
    render(<FoodCatalog />);
    await screen.findByText(/Pamonha/);
    fireEvent.click(screen.getAllByText('Excluir')[0]);
    await waitFor(() => expect(lib.deleteFood).toHaveBeenCalledWith('f1'));
  });

  it('erro de carregamento aparece', async () => {
    lib.fetchFoodCatalogAdmin.mockRejectedValue({ code: '42P01' });
    render(<FoodCatalog />);
    expect(await screen.findByText(/migration/)).toBeTruthy();
  });
});
