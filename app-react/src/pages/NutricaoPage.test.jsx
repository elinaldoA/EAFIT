// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within, act } from '@testing-library/react';

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
  foods: { fetchCustomFoods: vi.fn(), createCustomFood: vi.fn(), updateCustomFood: vi.fn(), deleteCustomFood: vi.fn(), restoreCustomFood: vi.fn(), readCachedFoods: vi.fn() },
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
vi.mock('../lib/supabase', () => ({
  db: {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }), gte: () => ({ order: () => Promise.resolve({ data: pastRows, error: null }) }) }) }),
      upsert: () => Promise.resolve({ error: null }),
      delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    }),
  },
}));
vi.mock('../lib/weightLog', () => weight);
vi.mock('../lib/nutritionPlan', () => ({ fetchPlan: vi.fn().mockResolvedValue([]), savePlan: vi.fn(async (_u, m) => m), readCachedPlan: () => [] }));
let pastRows = [];

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
  pastRows = [];
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
    expect(readLocalTotals()).toMatchObject({ protein: 7, kcal: 73 });
    expect(proteinLog.upsertNutritionLog).toHaveBeenCalledWith('u1', todayDate(), expect.objectContaining({ protein: 7, kcal: 73 }));
  });

  it('tocar num alimento não muda os botões de lugar na mesma visita', async () => {
    render(<NutricaoPage active />);
    await screen.findByText('Ovo');
    const labels = () => [...document.querySelectorAll('.water-quick__label')].map(e => e.textContent);
    const before = labels();
    fireEvent.click(screen.getAllByText('Banana')[0]);
    fireEvent.click(screen.getAllByText('Banana')[0]);
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

  it('apagar um atalho próprio é na hora e o Desfazer do aviso o devolve', async () => {
    window.confirm = vi.fn(() => true);
    const mine = { id: 'f1', custom: true, icon: '🍽️', label: 'Tapioca', g: 2, kcal: 140, carbs: 30, fat: 1 };
    foods.fetchCustomFoods.mockResolvedValue([mine]);
    foods.readCachedFoods.mockReturnValue([mine]);
    foods.deleteCustomFood.mockResolvedValue([]);
    foods.restoreCustomFood.mockResolvedValue([mine]);
    render(<NutricaoPage active />);
    fireEvent.click(await screen.findByText('Gerenciar meus atalhos'));
    fireEvent.click(screen.getByLabelText('Apagar o atalho "Tapioca"'));
    await waitFor(() => expect(foods.deleteCustomFood).toHaveBeenCalledWith('u1', 'f1'));
    expect(window.confirm).not.toHaveBeenCalled();
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Atalho "Tapioca" apagado', 6000, expect.objectContaining({ action: expect.objectContaining({ label: 'Desfazer' }) })));
    act(() => { mockToast.mock.calls.at(-1)[2].action.onClick(); });
    await waitFor(() => expect(foods.restoreCustomFood).toHaveBeenCalledWith('u1', mine));
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
    fireEvent.click(screen.getByText('Salvar'));
    await waitFor(() => expect(foods.updateCustomFood).toHaveBeenCalledWith('u1', 'f1', expect.objectContaining({ name: 'Tapioca', kcal: 200 })));
    expect(readLocalTotals().kcal).toBe(0);
  });

  it('registrar um alimento cria o item no diário da refeição escolhida e remover tira dos totais', async () => {
    window.confirm = vi.fn(() => true);
    render(<NutricaoPage active />);
    await screen.findByText('Ovo');
    fireEvent.change(screen.getByLabelText('Refeição'), { target: { value: 'jantar' } });
    fireEvent.click(screen.getByText('Ovo'));
    const log = document.querySelector('.meal-log');
    expect(log.textContent).toContain('Jantar');
    expect(log.textContent).toContain('Ovo');
    const antes = readLocalTotals().kcal;
    fireEvent.click(screen.getByLabelText('Remover "Ovo"'));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(readLocalTotals().kcal).toBe(0);
    expect(screen.getByText(/Nada registrado hoje/)).toBeTruthy();
    expect(mockToast).toHaveBeenCalledWith('"Ovo" removido', 6000, expect.objectContaining({ action: expect.objectContaining({ label: 'Desfazer' }) }));
    act(() => mockToast.mock.calls.at(-1)[2].action.onClick());
    expect(readLocalTotals().kcal).toBe(antes);
    expect(document.querySelector('.meal-log').textContent).toContain('Jantar');
  });

  it('Zerar o dia zera na hora e o Desfazer do aviso devolve registros e totais', async () => {
    window.confirm = vi.fn(() => true);
    render(<NutricaoPage active />);
    fireEvent.click(await screen.findByText('Ovo'));
    const kcal = readLocalTotals().kcal;
    expect(kcal).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('Zerar o dia'));
    expect(window.confirm).not.toHaveBeenCalled();
    expect(readLocalTotals().kcal).toBe(0);
    expect(screen.getByText(/Nada registrado hoje/)).toBeTruthy();
    expect(mockToast).toHaveBeenCalledWith('Dia zerado', 6000, expect.objectContaining({ action: expect.objectContaining({ label: 'Desfazer' }) }));
    act(() => mockToast.mock.calls.at(-1)[2].action.onClick());
    expect(readLocalTotals().kcal).toBe(kcal);
    expect(document.querySelector('.meal-log').textContent).toContain('Ovo');
  });

  it('editar um registro do diário acerta os totais do dia', async () => {
    render(<NutricaoPage active />);
    fireEvent.click(await screen.findByText('Ovo'));
    fireEvent.click(screen.getByLabelText('Editar "Ovo"'));
    const kcal = screen.getAllByRole('spinbutton')[0];
    expect(kcal.value).toBe('73');
    fireEvent.change(kcal, { target: { value: '140' } });
    fireEvent.click(screen.getByText('Salvar'));
    expect(readLocalTotals().kcal).toBe(140);
  });

  it('abrir a busca já deixa o campo pronto para digitar', async () => {
    render(<NutricaoPage active />);
    fireEvent.click(await screen.findByText('🔎 Buscar alimento'));
    expect(document.activeElement).toBe(screen.getByLabelText('Buscar alimento'));
  });

  it('buscar um alimento e informar os gramas soma o valor proporcional', async () => {
    render(<NutricaoPage active />);
    fireEvent.click(await screen.findByText('🔎 Buscar alimento'));
    fireEvent.change(screen.getByLabelText('Buscar alimento'), { target: { value: 'arroz branco' } });
    fireEvent.click(await within(document.querySelector('.food-search')).findByText(/Arroz branco cozido/));
    fireEvent.change(screen.getByLabelText('Quantidade (g)'), { target: { value: '200' } });
    fireEvent.click(screen.getByText('Adicionar'));
    expect(readLocalTotals().kcal).toBe(256);
    expect(document.querySelector('.meal-log').textContent).toContain('Arroz branco cozido 200g');
    // Arroz da TACO traz fibra e sódio: entram no card do dia, junto dos macros.
    const card = document.querySelector('.nutri-day');
    expect(card.textContent).toContain('Fibras3,2');
    expect(screen.getByRole('progressbar', { name: 'Sódio' })).toBeTruthy();
    // A pizza só tem fatia para macro com calorias (o arroz não tem gordura).
    expect(card.querySelectorAll('.nutri-pie__slice')).toHaveLength(2);
  });

  it('medida caseira converte para gramas', async () => {
    render(<NutricaoPage active />);
    fireEvent.click(await screen.findByText('🔎 Buscar alimento'));
    fireEvent.change(screen.getByLabelText('Buscar alimento'), { target: { value: 'arroz branco' } });
    fireEvent.click(await within(document.querySelector('.food-search')).findByText(/Arroz branco cozido/));
    fireEvent.change(screen.getByLabelText('Medida'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('Adicionar'));
    // 2 escumadeiras de 90 g = 180 g de arroz a 128 kcal/100 g.
    expect(readLocalTotals().kcal).toBe(230);
    expect(document.querySelector('.meal-log').textContent).toContain('Arroz branco cozido 180g');
  });

  it('ajustar o total de hoje direto troca os totais do dia', async () => {
    render(<NutricaoPage active />);
    fireEvent.click(await screen.findByText('Corrigir os totais de um dia'));
    fireEvent.change(screen.getByLabelText('Dia'), { target: { value: todayDate() } });
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '1800' } });
    fireEvent.click(screen.getByText('Salvar o dia'));
    expect(readLocalTotals().kcal).toBe(1800);
  });

  it('corrigir um dia anterior grava os totais daquele dia', async () => {
    render(<NutricaoPage active />);
    fireEvent.click(await screen.findByText('Corrigir os totais de um dia'));
    const select = screen.getByLabelText('Dia');
    const date = select.querySelectorAll('option')[2].value;
    fireEvent.change(select, { target: { value: date } });
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '2100' } });
    fireEvent.click(screen.getByText('Salvar o dia'));
    expect(proteinLog.upsertNutritionLog).toHaveBeenCalledWith('u1', date, expect.objectContaining({ kcal: 2100 }));
    expect(mockToast).toHaveBeenCalledWith('Dia corrigido');
  });

  it('refeições para o objetivo: a refeição de sempre aparece como opção e entra inteira com um toque', async () => {
    const day = n => { const d = new Date(`${todayDate()}T12:00:00`); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    const r = (date, name, kcal) => ({ log_date: date, meal: 'jantar', name, icon: '🍽️', protein_g: 10, kcal, carbs_g: 0, fat_g: 0 });
    pastRows = [r(day(1), 'Tapioca', 200), r(day(1), 'Suco', 100), r(day(2), 'Tapioca', 200), r(day(2), 'Suco', 100)];
    render(<NutricaoPage active />);
    await screen.findByText('Ovo');
    fireEvent.change(screen.getByLabelText('Refeição'), { target: { value: 'jantar' } });
    const name = () => document.querySelector('.goal-meals__head strong').textContent;
    await waitFor(() => expect(screen.getByText(/Outra opção/)).toBeTruthy());
    for (let i = 0; i < 6 && name() !== 'O de sempre no jantar'; i++) fireEvent.click(screen.getByText(/Outra opção/));
    expect(name()).toBe('O de sempre no jantar');
    expect(screen.getByText('Seu hábito')).toBeTruthy();
    fireEvent.click(screen.getByText('Registrar esta refeição'));
    expect(readLocalTotals()).toMatchObject({ kcal: 300, protein: 20 });
    expect(document.querySelector('.meal-log').textContent).toContain('Tapioca');
    // Lançada a refeição de sempre, ela sai das opções.
    expect(screen.queryByText('Seu hábito')).toBeNull();
  });

  it('um card só: sem o "Próximo passo" separado, e a refeição escolhida nele vale para "Adicionar ao dia"', async () => {
    render(<NutricaoPage active />);
    await screen.findByText('Ovo');
    expect(screen.queryByText('Próximo passo')).toBeNull();
    expect(screen.queryByText('Registrar agora')).toBeNull();
    expect(screen.getByText('Adicionar ao dia · ' + document.querySelector('.goal-meals__meal option:checked').textContent)).toBeTruthy();
    const name = () => document.querySelector('.goal-meals__head strong').textContent;
    const first = name();
    fireEvent.click(screen.getByText(/Outra opção/));
    expect(name()).not.toBe(first);
  });

  it('sem nada para desfazer, não mostra o botão de desfazer nem o de zerar', async () => {
    render(<NutricaoPage active />);
    await screen.findByText('Ovo');
    expect(screen.queryByText(/Desfazer/)).toBeNull();
    expect(screen.queryByText('Zerar o dia')).toBeNull();
  });

  it('refeições para o objetivo: escolher a refeição e registrar soma todos os itens nela', async () => {
    render(<NutricaoPage active />);
    await screen.findByText('Sua próxima refeição');
    fireEvent.change(screen.getByLabelText('Refeição'), { target: { value: 'almoco' } });
    expect(screen.getByLabelText('Refeição').value).toBe('almoco');
    const n = document.querySelectorAll('.goal-meals__items li').length;
    expect(n).toBeGreaterThan(1);
    fireEvent.click(screen.getByText('Registrar esta refeição'));
    expect(readLocalTotals().kcal).toBeGreaterThan(300);
    expect(document.querySelectorAll('.meal-log__item')).toHaveLength(n);
    expect(document.querySelector('.meal-log').textContent).toContain('Almoço');
    expect(mockToast).toHaveBeenCalledWith('Refeição registrada');
  });

  it('registrada, a sugestão vira "✅ Registrada" (sem registrar de novo) e Desfazer tira a refeição inteira', async () => {
    render(<NutricaoPage active />);
    await screen.findByText('Sua próxima refeição');
    fireEvent.change(screen.getByLabelText('Refeição'), { target: { value: 'almoco' } });
    const before = readLocalTotals().kcal || 0;
    fireEvent.click(screen.getByText('Registrar esta refeição'));
    expect(screen.queryByText('Registrar esta refeição')).toBeNull();
    const status = screen.getByText(/Registrada no almoço/);
    fireEvent.click(within(status).getByRole('button', { name: 'Desfazer' }));
    expect(document.querySelectorAll('.meal-log__item')).toHaveLength(0);
    expect(readLocalTotals().kcal || 0).toBe(before);
    expect(mockToast).toHaveBeenCalledWith('Refeição desfeita');
    expect(screen.getByText('Registrar esta refeição')).toBeTruthy();
  });

  describe('apoio no fim do dia e no diário', () => {
    afterEach(() => vi.useRealTimers());
    const at = hour => { vi.useFakeTimers({ toFake: ['Date'] }); const d = new Date(); d.setHours(hour, 0, 0, 0); vi.setSystemTime(d); };
    const dayAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

    it('à tarde, com proteína faltando, sugere o que fecha a meta e um toque registra', async () => {
      at(18);
      render(<NutricaoPage active />);
      await screen.findByText('Ovo');
      expect(screen.getByText(/Para fechar a proteína de hoje/)).toBeTruthy();
      const btn = document.querySelector('.close-protein button');
      fireEvent.click(btn);
      expect(readLocalTotals().protein).toBeGreaterThan(0);
    });

    it('de manhã não sugere nada', async () => {
      at(9);
      render(<NutricaoPage active />);
      await screen.findByText('Ovo');
      expect(screen.queryByText(/Para fechar a proteína de hoje/)).toBeNull();
    });

    it('repete a refeição de ontem e abre a busca com os alimentos de sempre', async () => {
      at(9);
      const r = (name, kcal) => ({ log_date: dayAgo(1), meal: 'cafe', name, icon: '🍞', protein_g: 5, kcal, carbs_g: 10, fat_g: 1 });
      pastRows = [r('Pão 50g', 130), r('Café 100g', 20)];
      render(<NutricaoPage active />);
      await screen.findByText('Ovo');
      fireEvent.click(await screen.findByText(/Repetir café da manhã de ontem/));
      expect(readLocalTotals()).toMatchObject({ kcal: 150, protein: 10 });
      expect(screen.queryByText(/Repetir café da manhã de ontem/)).toBeNull();
      fireEvent.click(screen.getByText('🔎 Buscar alimento'));
      expect(screen.getByText('Seus alimentos de sempre')).toBeTruthy();
    });
  });
});
