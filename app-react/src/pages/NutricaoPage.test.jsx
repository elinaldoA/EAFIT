// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const { mockToast, mockMarkPending, proteinLog, foods, weight } = vi.hoisted(() => ({
  mockToast: vi.fn(),
  mockMarkPending: vi.fn(),
  proteinLog: {
    fetchNutritionLog: vi.fn(),
    upsertNutritionLog: vi.fn(),
    fetchProteinLogsRange: vi.fn(),
    readLocalTotals: undefined,
    writeLocalTotals: undefined,
  },
  foods: { fetchCustomFoods: vi.fn(), createCustomFood: vi.fn(), updateCustomFood: vi.fn(), deleteCustomFood: vi.fn(), readCachedFoods: vi.fn() },
  weight: { fetchWeightLogs: vi.fn() },
}));

vi.mock('../context/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', user_metadata: { peso: 70, altura: 175, idade: 30, sexo: 'M', meta: 'ganhar' } } }),
}));
vi.mock('../context/useToast', () => ({ useToast: () => mockToast }));
vi.mock('../context/useWorkout', () => ({ useWorkout: () => ({ markPending: mockMarkPending }) }));
vi.mock('../lib/proteinLog', async importOriginal => {
  const real = await importOriginal();
  return { ...real, ...proteinLog, readLocalTotals: real.readLocalTotals, writeLocalTotals: real.writeLocalTotals };
});
vi.mock('../lib/nutritionFoods', () => foods);
vi.mock('../lib/weightLog', () => weight);

import NutricaoPage from './NutricaoPage';
import { readLocalTotals } from '../lib/proteinLog';
import { todayDate } from '../data/treinoData';

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  proteinLog.fetchNutritionLog.mockResolvedValue(null);
  proteinLog.fetchProteinLogsRange.mockResolvedValue([]);
  proteinLog.upsertNutritionLog.mockResolvedValue(undefined);
  foods.fetchCustomFoods.mockResolvedValue([]);
  foods.readCachedFoods.mockReturnValue([]);
  weight.fetchWeightLogs.mockResolvedValue([]);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('NutricaoPage', () => {
  it('não busca nada enquanto a aba não está ativa', () => {
    render(<NutricaoPage active={false} />);
    expect(proteinLog.fetchNutritionLog).not.toHaveBeenCalled();
  });

  it('ao abrir, carrega o dia de hoje do servidor', async () => {
    proteinLog.fetchNutritionLog.mockResolvedValue({ protein: 40, kcal: 500, carbs: 50, fat: 10 });
    render(<NutricaoPage active />);
    await waitFor(() => expect(readLocalTotals().protein).toBe(40));
    expect(proteinLog.fetchNutritionLog).toHaveBeenCalledWith('u1', todayDate());
  });

  it('tocar num atalho soma ao dia e grava no servidor', async () => {
    render(<NutricaoPage active />);
    fireEvent.click(await screen.findByText('Ovo'));
    expect(readLocalTotals()).toMatchObject({ protein: 6, kcal: 70 });
    expect(proteinLog.upsertNutritionLog).toHaveBeenCalledWith('u1', todayDate(), expect.objectContaining({ protein: 6, kcal: 70 }));
  });

  it('tocar num alimento não muda os botões de lugar na mesma visita', async () => {
    render(<NutricaoPage active />);
    await screen.findByText('Ovo');
    const labels = () => [...document.querySelectorAll('.water-quick__label')].map(e => e.textContent);
    const before = labels();
    fireEvent.click(screen.getByText('Banana'));
    fireEvent.click(screen.getByText('Banana'));
    expect(labels()).toEqual(before);
  });

  it('falha ao gravar: enfileira e avisa o contexto', async () => {
    proteinLog.upsertNutritionLog.mockRejectedValue(new Error('offline'));
    render(<NutricaoPage active />);
    fireEvent.click(await screen.findByText('Ovo'));
    await waitFor(() => expect(mockMarkPending).toHaveBeenCalled());
    expect(JSON.parse(localStorage.getItem('pendingSyncQueue'))[0].type).toBe('nutrition_log');
  });

  it('desfazer tira o último alimento, mesmo depois de reabrir o app', async () => {
    const first = render(<NutricaoPage active />);
    fireEvent.click(await screen.findByText('Ovo'));
    first.unmount();

    render(<NutricaoPage active />);
    fireEvent.click(await screen.findByRole('button', { name: /Desfazer Ovo/ }));
    expect(readLocalTotals().protein).toBe(0);
  });

  it('"Outro alimento" com nome e "salvar como atalho" cria o atalho e soma ao dia', async () => {
    const saved = { id: 'f1', custom: true, icon: '🍽️', label: 'Tapioca', g: 2, kcal: 140, carbs: 30, fat: 1 };
    foods.createCustomFood.mockResolvedValue([saved]);
    render(<NutricaoPage active />);
    fireEvent.click(await screen.findByText('+ Outro alimento'));
    const [kcal] = screen.getAllByRole('spinbutton');
    fireEvent.change(kcal, { target: { value: '140' } });
    fireEvent.change(screen.getByLabelText('Nome (para salvar como atalho)'), { target: { value: 'Tapioca' } });
    fireEvent.click(screen.getByLabelText('Salvar como atalho'));
    fireEvent.click(screen.getByText('Adicionar'));
    await waitFor(() => expect(foods.createCustomFood).toHaveBeenCalledWith('u1', expect.objectContaining({ name: 'Tapioca', kcal: 140 })));
    await waitFor(() => expect(readLocalTotals().kcal).toBe(140));
  });

  it('editar um atalho próprio atualiza o atalho e não mexe no dia', async () => {
    const mine = { id: 'f1', custom: true, icon: '🍽️', label: 'Tapioca', g: 2, kcal: 140, carbs: 30, fat: 1 };
    foods.fetchCustomFoods.mockResolvedValue([mine]);
    foods.readCachedFoods.mockReturnValue([mine]);
    foods.updateCustomFood.mockResolvedValue([{ ...mine, kcal: 200 }]);
    render(<NutricaoPage active />);
    fireEvent.click(await screen.findByText('Gerenciar meus atalhos'));
    fireEvent.click(screen.getByLabelText('Editar o atalho "Tapioca"'));
    const kcal = screen.getAllByRole('spinbutton')[0];
    expect(kcal.value).toBe('140');
    fireEvent.change(kcal, { target: { value: '200' } });
    fireEvent.click(screen.getByText('Salvar atalho'));
    await waitFor(() => expect(foods.updateCustomFood).toHaveBeenCalledWith('u1', 'f1', expect.objectContaining({ name: 'Tapioca', kcal: 200 })));
    expect(readLocalTotals().kcal).toBe(0);
  });

  it('corrigir um dia anterior grava os totais daquele dia', async () => {
    render(<NutricaoPage active />);
    fireEvent.click(await screen.findByText('Corrigir um dia anterior'));
    const select = screen.getByLabelText('Dia');
    const date = select.querySelectorAll('option')[1].value;
    fireEvent.change(select, { target: { value: date } });
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '2100' } });
    fireEvent.click(screen.getByText('Salvar o dia'));
    expect(proteinLog.upsertNutritionLog).toHaveBeenCalledWith('u1', date, expect.objectContaining({ kcal: 2100 }));
    expect(mockToast).toHaveBeenCalledWith('Dia corrigido');
  });
});
