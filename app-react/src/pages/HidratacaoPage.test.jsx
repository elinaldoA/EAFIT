// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const { mockToast, mockMarkPending, waterLog } = vi.hoisted(() => ({
  mockToast: vi.fn(),
  mockMarkPending: vi.fn(),
  waterLog: { fetchWaterLog: vi.fn(), upsertWaterLog: vi.fn(), fetchWaterLogsRange: vi.fn() },
}));

vi.mock('../context/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1', user_metadata: { peso: 70 } } }) }));
vi.mock('../context/useToast', () => ({ useToast: () => mockToast }));
vi.mock('../context/useWorkout', () => ({ useWorkout: () => ({ markPending: mockMarkPending }) }));
vi.mock('../lib/waterLog', () => waterLog);

import HidratacaoPage from './HidratacaoPage';
import { waterStorageKey, todayDate } from '../data/treinoData';

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  waterLog.fetchWaterLog.mockResolvedValue(500);
  waterLog.fetchWaterLogsRange.mockResolvedValue([]);
  waterLog.upsertWaterLog.mockResolvedValue(undefined);
});

describe('HidratacaoPage', () => {
  it('ao abrir, carrega o total de hoje do servidor', async () => {
    render(<HidratacaoPage active />);
    await waitFor(() => expect(localStorage.getItem(waterStorageKey())).toBe('500'));
    expect(waterLog.fetchWaterLog).toHaveBeenCalledWith('u1', todayDate());
    expect(screen.getByText('Hidratação hoje')).toBeTruthy();
  });

  it('não busca nada enquanto a aba não está ativa', () => {
    render(<HidratacaoPage active={false} />);
    expect(waterLog.fetchWaterLog).not.toHaveBeenCalled();
  });

  it('o que falta é contado em copos do botão Copo (200 ml)', async () => {
    render(<HidratacaoPage active />);
    await waitFor(() => expect(localStorage.getItem(waterStorageKey())).toBe('500'));
    const hint = document.querySelector('.water-hero__hint').textContent;
    expect(hint).toMatch(/^≈ \d+ copos de 200ml$/);
    expect(screen.getByText('+200ml')).toBeTruthy();
  });

  it('o consumido e o que falta somam a meta (750 ml é 0,75L, não 0,8L)', async () => {
    waterLog.fetchWaterLog.mockResolvedValue(750);
    render(<HidratacaoPage active />);
    await waitFor(() => expect(localStorage.getItem(waterStorageKey())).toBe('750'));
    const num = sel => parseFloat(document.querySelector(sel).textContent.match(/[\d,]+/)[0].replace(',', '.'));
    expect(document.querySelector('.water-hero__value').textContent).toBe('0,75L');
    const goal = num('.water-hero__goal');
    const left = parseFloat(screen.getByText(/^Faltam/).textContent.match(/[\d,]+/)[0].replace(',', '.'));
    expect(Math.round((0.75 + left) * 100)).toBe(Math.round(goal * 100));
  });

  it('adicionar um copo grava local e no servidor', async () => {
    render(<HidratacaoPage active />);
    await waitFor(() => expect(localStorage.getItem(waterStorageKey())).toBe('500'));

    fireEvent.click(screen.getByText('+200ml'));

    expect(localStorage.getItem(waterStorageKey())).toBe('700');
    expect(waterLog.upsertWaterLog).toHaveBeenCalledWith('u1', todayDate(), 700);
  });

  it('falha ao gravar: enfileira para sincronizar depois e avisa o contexto', async () => {
    render(<HidratacaoPage active />);
    await waitFor(() => expect(localStorage.getItem(waterStorageKey())).toBe('500'));
    waterLog.upsertWaterLog.mockRejectedValue(new Error('offline'));

    fireEvent.click(screen.getByText('+300ml'));

    await waitFor(() => expect(mockMarkPending).toHaveBeenCalled());
    const queue = JSON.parse(localStorage.getItem('pendingSyncQueue'));
    expect(queue[0]).toMatchObject({ type: 'water_log', payload: { userId: 'u1', amountMl: 800 } });
  });

  it('erro ao carregar mostra aviso em vez de quebrar a tela', async () => {
    waterLog.fetchWaterLog.mockRejectedValue(new Error('rede'));
    render(<HidratacaoPage active />);
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('⚠️ Erro ao carregar dados de hidratação'));
    expect(screen.getByText('Hidratação hoje')).toBeTruthy();
  });
});
