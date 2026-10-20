// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { lib } = vi.hoisted(() => ({ lib: { fetchCalendar: vi.fn() } }));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/calendar', async orig => ({ ...(await orig()), ...lib }));

import EditorialCalendar from './EditorialCalendar';
import { buildEvents, busyDays, eventsInMonth, monthGrid } from '../lib/calendar';
import { todayStr } from '../lib/community';

const raw = {
  settings: {
    season: { enabled: true, periods: [{ theme: 'natal', startsOn: '2026-12-01', endsOn: '2026-12-26' }, { theme: 'ano_novo', startsOn: '2026-12-26', endsOn: '2027-01-02' }] },
    banner: { enabled: true, message: 'Novidade no app', startsOn: '2026-12-10', endsOn: '' },
  },
  broadcasts: [
    { id: 1, title: 'Bom dia', scheduled_at: '2026-12-05T12:00:00Z', sent_at: null },
    { id: 2, title: 'Boa tarde', scheduled_at: '2026-12-05T18:00:00Z', sent_at: null },
  ],
  challenges: [
    { title: 'Dezembro forte', start: '2026-12-01', end: '2026-12-14', official: true },
    { title: 'Do usuário', start: '2026-12-01', end: '2026-12-14', official: false },
  ],
  surveys: [{ question: 'Gostou?', active: true, starts_on: '2026-12-20', ends_on: null, created_at: '2026-12-01T00:00:00Z' }],
  experiments: [{ key: 'x', name: 'Botão novo', status: 'rascunho', started_at: null, ended_at: null }],
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('calendar', () => {
  it('monta os eventos, a grade do mês e os dias cheios', () => {
    const ev = buildEvents(raw, '2026-12-01');
    expect(ev.map(e => e.type).sort()).toEqual(['aviso', 'desafio', 'envio', 'envio', 'pesquisa', 'tema', 'tema']);
    expect(ev.find(e => e.type === 'aviso').end).toBe('9999-12-31');
    expect(ev.find(e => e.title === 'Bom dia')).toMatchObject({ start: '2026-12-05', time: '09:00', done: false });

    const weeks = monthGrid(2026, 12, ev);
    // 1º/12/2026 é terça: dois vazios antes.
    expect(weeks[0].slice(0, 3).map(c => c && c.day)).toEqual([null, null, 1]);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
    expect(busyDays(weeks)).toEqual(['2026-12-05', '2026-12-26']);
    expect(eventsInMonth(2027, 1, ev).map(e => e.type).sort()).toEqual(['aviso', 'pesquisa', 'tema']);
  });
});

describe('EditorialCalendar', () => {
  it('mostra o mês atual, filtra por tipo e navega entre meses', async () => {
    const today = todayStr();
    lib.fetchCalendar.mockResolvedValue({
      settings: {}, challenges: [], surveys: [], experiments: [],
      broadcasts: [{ id: 1, title: 'Envio de hoje', scheduled_at: `${today}T15:00:00Z`, sent_at: null }],
    });
    render(<MemoryRouter><EditorialCalendar /></MemoryRouter>);
    expect((await screen.findAllByText(/Envio de hoje/)).length).toBe(2);
    expect(screen.getByRole('link', { name: 'Abrir' }).getAttribute('href')).toBe('/notificacoes');

    fireEvent.click(screen.getByRole('button', { name: /Envio agendado/ }));
    expect(screen.queryByText(/Envio de hoje/)).toBeNull();
    expect(screen.getByText('Nada programado neste mês.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Envio agendado/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(screen.queryByText(/Envio de hoje/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(screen.getAllByText(/Envio de hoje/).length).toBe(2);
  });
});
