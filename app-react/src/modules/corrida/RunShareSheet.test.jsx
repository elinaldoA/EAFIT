// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({ render: vi.fn(async () => new Blob(['x'])), share: vi.fn(async () => 'shared') }));
vi.mock('./runShareCard', () => ({
  renderRunCard: (...a) => h.render(...a),
  shareRunCard: (...a) => h.share(...a),
  renderRunSummaryCard: (...a) => h.render(...a),
  shareRunSummary: (...a) => h.share(...a),
  canColorTrace: (run, mode) => mode === 'laranja' || mode === 'ritmo',
}));
const toastFn = () => {};
vi.mock('../../context/useToast', () => ({ useToast: () => toastFn }));
vi.mock('../../hooks/useBackToClose', () => ({ useBackToClose: () => {} }));
vi.mock('../../lib/modalRoot', () => ({ getModalRoot: () => document.body }));

import RunShareSheet from './RunShareSheet';
import SummaryShareSheet from './SummaryShareSheet';

const run = {
  run_date: '2026-11-17', distance_m: 5000, duration_s: 1500, route: [[[1, 1, 0], [2, 2, 10]]],
  badges: [{ icon: '🏆', text: 'Maior distância: 5,00 km' }],
};

afterEach(() => cleanup());
beforeEach(() => {
  h.render.mockClear();
  h.share.mockClear();
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

describe('RunShareSheet', () => {
  it('desenha a prévia e refaz o cartão a cada escolha de estilo, cor e fundo', async () => {
    render(<RunShareSheet run={run} onClose={() => {}} />);
    await waitFor(() => expect(h.render).toHaveBeenCalledTimes(1));
    expect(h.render.mock.calls[0][2]).toMatchObject({ style: 'mapa', trace: 'laranja', bg: 'escuro' });

    fireEvent.click(screen.getByRole('button', { name: 'Pelo ritmo' }));
    await waitFor(() => expect(h.render.mock.calls.at(-1)[2]).toMatchObject({ trace: 'ritmo' }));
    // sem subida por km não oferece pintar pela subida
    expect(screen.queryByRole('button', { name: 'Pela subida' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Mapa claro' }));
    await waitFor(() => expect(h.render.mock.calls.at(-1)[2]).toMatchObject({ bg: 'claro' }));

    fireEvent.click(screen.getByRole('button', { name: 'Transparente' }));
    await waitFor(() => expect(h.render.mock.calls.at(-1)[2]).toMatchObject({ bg: 'transparente' }));
    expect(screen.getByText(/sem fundo/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '🔢 Só números' }));
    await waitFor(() => expect(h.render.mock.calls.at(-1)[2]).toMatchObject({ style: 'numeros', trace: 'laranja', bg: 'transparente' }));
    // no cartão só de números o mapa claro some, mas o transparente continua
    expect(screen.queryByRole('button', { name: 'Mapa claro' })).toBeNull();
  });

  it('os selos podem ser desligados e o compartilhar leva as mesmas escolhas', async () => {
    render(<RunShareSheet run={run} onClose={() => {}} />);
    await waitFor(() => expect(h.render).toHaveBeenCalled());
    expect(h.render.mock.calls.at(-1)[2].badges).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '🏆 Recordes e conquistas' }));
    await waitFor(() => expect(h.render.mock.calls.at(-1)[2].badges).toEqual([]));
    const btn = await screen.findByRole('button', { name: '📤 Compartilhar' });
    await waitFor(() => expect(btn.disabled).toBe(false));
    await act(async () => { fireEvent.click(btn); });
    expect(h.share).toHaveBeenCalledTimes(1);
    expect(h.share.mock.calls[0][0]).toBe(run);
    expect(h.share.mock.calls[0][2]).toMatchObject({ badges: [] });
  });

  it('corrida sem percurso abre direto no cartão só de números', async () => {
    render(<RunShareSheet run={{ ...run, route: [] }} onClose={() => {}} />);
    await waitFor(() => expect(h.render).toHaveBeenCalled());
    expect(h.render.mock.calls[0][2]).toMatchObject({ style: 'numeros' });
    expect(screen.queryByRole('button', { name: '🗺️ Mapa' })).toBeNull();
  });
});

describe('SummaryShareSheet', () => {
  const r = (date) => ({ run_date: date, distance_m: 5000, duration_s: 1800 });

  it('oferece só os períodos que têm corrida e compartilha o escolhido com a meta dele', async () => {
    // só no ano (nem no mês nem na semana)
    render(<SummaryShareSheet runs={[r('2026-03-05')]} today="2026-11-18" goals={{ week: 10, month: 40, year: 500 }} onClose={() => {}} />);
    await waitFor(() => expect(h.render).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Semana' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mês' })).toBeNull();
    expect(h.render.mock.calls.at(-1)[3]).toBe(500);
    expect(h.render.mock.calls.at(-1)[4]).toEqual({ period: 'year' });
    const btn = await screen.findByRole('button', { name: '📤 Compartilhar' });
    await waitFor(() => expect(btn.disabled).toBe(false));
    await act(async () => { fireEvent.click(btn); });
    expect(h.share.mock.calls[0][3]).toBe(500);
    expect(h.share.mock.calls[0][4]).toEqual({ period: 'year' });
  });

  it('troca de período refaz o cartão com a meta daquele período', async () => {
    render(<SummaryShareSheet runs={[r('2026-11-17'), r('2026-11-10')]} today="2026-11-18" goals={{ week: 10, month: 40, year: 500 }} onClose={() => {}} />);
    await waitFor(() => expect(h.render).toHaveBeenCalled());
    expect(h.render.mock.calls.at(-1)[4]).toEqual({ period: 'month' });
    fireEvent.click(screen.getByRole('button', { name: 'Semana' }));
    await waitFor(() => expect(h.render.mock.calls.at(-1)[4]).toEqual({ period: 'week' }));
    expect(h.render.mock.calls.at(-1)[3]).toBe(10);
  });
});
