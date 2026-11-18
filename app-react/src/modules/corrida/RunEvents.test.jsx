// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';

vi.mock('../../lib/supabase', () => ({ db: {} }));
vi.mock('../../context/useAuth', () => ({ useAuth: () => ({ user: { user_metadata: {} }, updateProfile: vi.fn() }) }));
vi.mock('../../context/useToast', () => ({ useToast: () => vi.fn() }));
vi.mock('../../lib/tracking', () => ({ trackEvent: vi.fn() }));

const row = (id, state, lat, lng, name) => ({
  id, name, event_date: '2026-12-06', city: 'Cidade', state, venue: '', lat, lng, distances: [5, 10], url: '', source: '',
});
const ROWS = [row('1', 'ES', -20.3, -40.3, 'Prova do ES'), row('2', 'MG', -19.9, -43.9, 'Prova de MG')];

const h = vi.hoisted(() => ({ rows: [] }));
vi.mock('./events', async (orig) => {
  const m = await orig();
  return { ...m, fetchRunEvents: async () => h.rows.map(m.toEvent) };
});

import RunEvents from './RunEvents';
import * as events from './events';

describe('RunEvents: só as corridas do estado da pessoa', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    h.rows = ROWS;
  });

  it('sem estado guardado: só o botão, sem seletor de raio e sem lista', async () => {
    render(<RunEvents today="2026-11-18" />);
    expect(await screen.findByRole('button', { name: /corridas do meu estado/i })).toBeTruthy();
    expect(screen.queryByText('Prova do ES')).toBeNull();
    expect(screen.queryByLabelText(/raio/i)).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('com estado guardado: mostra só as provas desse estado', async () => {
    localStorage.setItem(events.LOC_KEY, JSON.stringify({ uf: 'MG' }));
    render(<RunEvents today="2026-11-18" />);
    expect(await screen.findByText('Prova de MG')).toBeTruthy();
    expect(screen.queryByText('Prova do ES')).toBeNull();
    expect(screen.getByText(/Corridas em MG/)).toBeTruthy();
  });

  it('posição guardada pela versão antiga vira só o estado', async () => {
    localStorage.setItem(events.LOC_KEY, JSON.stringify({ lat: -20.3, lon: -40.3 }));
    render(<RunEvents today="2026-11-18" />);
    expect(await screen.findByText('Prova do ES')).toBeTruthy();
    await waitFor(() => expect(JSON.parse(localStorage.getItem(events.LOC_KEY))).toEqual({ uf: 'ES' }));
  });

  it('localização negada: aparece a escolha do estado como alternativa', async () => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (_ok, err) => err(new Error('denied')) } });
    render(<RunEvents today="2026-11-18" />);
    fireEvent.click(await screen.findByRole('button', { name: /corridas do meu estado/i }));
    const select = await screen.findByRole('combobox', { name: /estado/i });
    fireEvent.change(select, { target: { value: 'ES' } });
    expect(await screen.findByText('Prova do ES')).toBeTruthy();
  });
});
