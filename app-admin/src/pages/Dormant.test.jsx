// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { lib } = vi.hoisted(() => ({
  lib: { fetchDormant: vi.fn(), fetchDormantRule: vi.fn(), sendToDormant: vi.fn(), setDormantRuleEnabled: vi.fn() },
}));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/dormant', async orig => ({ ...(await orig()), ...lib }));
vi.mock('../components/MessageEditor', () => ({
  default: ({ title, body, onTitle, onBody }) => (
    <>
      <input aria-label="Título" value={title} onChange={e => onTitle(e.target.value)} />
      <textarea aria-label="Mensagem" value={body} onChange={e => onBody(e.target.value)} />
    </>
  ),
}));

import Dormant from './Dormant';
import { defaultSelection, fromRow, summarize } from '../lib/dormant';

const wrap = ui => render(<MemoryRouter>{ui}</MemoryRouter>);

const PEOPLE = [
  { id: 'u1', email: 'ana@x.com', name: 'Ana', lastWorkout: '2026-10-10', lastSeen: null, days: 20, push: true, emailOk: true, paused: false, lastNotified: null },
  { id: 'u2', email: 'bia@x.com', name: '', lastWorkout: null, lastSeen: null, days: 9, push: false, emailOk: true, paused: false, lastNotified: null },
  { id: 'u3', email: 'caio@x.com', name: 'Caio', lastWorkout: null, lastSeen: null, days: 8, push: false, emailOk: false, paused: false, lastNotified: null },
  { id: 'u4', email: 'duda@x.com', name: 'Duda', lastWorkout: null, lastSeen: null, days: 30, push: true, emailOk: true, paused: true, lastNotified: null },
];
const RULE = { kind: 'dormant', enabled: false, send_hour: 18, weekdays: null, cooldown_days: 7, title: 'Oi {nome}', body: 'Volta' };

beforeEach(() => {
  vi.clearAllMocks();
  lib.fetchDormant.mockResolvedValue(PEOPLE);
  lib.fetchDormantRule.mockResolvedValue(RULE);
  lib.sendToDormant.mockResolvedValue({ sent: 1, targetCount: 1, emailSent: 2, emailTargetCount: 2 });
  lib.setDormantRuleEnabled.mockResolvedValue();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(cleanup);

describe('lib/dormant', () => {
  it('converte a linha do banco', () => {
    expect(fromRow({ user_id: 'u1', email: 'a@x.com', nome: null, days_away: '12', has_push: true, email_ok: false, paused: false }))
      .toEqual(expect.objectContaining({ id: 'u1', name: '', days: 12, push: true, emailOk: false }));
  });

  it('marca por padrão só quem tem canal e não está em pausa', () => {
    expect([...defaultSelection(PEOPLE)]).toEqual(['u1', 'u2']);
  });

  it('resume canais da lista ou da seleção', () => {
    expect(summarize(PEOPLE)).toEqual({ total: 4, push: 2, email: 3, none: 1 });
    expect(summarize(PEOPLE, new Set(['u2']))).toEqual({ total: 1, push: 0, email: 1, none: 0 });
  });
});

describe('Dormant', () => {
  it('lista os sumidos com canais e link pro usuário', async () => {
    wrap(<Dormant />);
    expect(await screen.findByRole('link', { name: 'Ana' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ana' }).getAttribute('href')).toBe('/users/u1');
    expect(screen.getByText('pessoas sumidas')).toBeTruthy();
    expect(screen.getAllByText('push + e-mail', { selector: 'td' })).toHaveLength(2);
    expect(screen.getByText('nenhum')).toBeTruthy();
    expect(screen.getByText('em modo pausa')).toBeTruthy();
    expect(lib.fetchDormant).toHaveBeenCalledWith(7);
  });

  it('envio manual vai para os selecionados, com e-mail', async () => {
    wrap(<Dormant />);
    fireEvent.click(await screen.findByText('Enviar para 2 selecionado(s)'));
    await waitFor(() => expect(lib.sendToDormant).toHaveBeenCalledWith({
      ids: ['u1', 'u2'], title: '👋 {nome}, sentimos sua falta', body: expect.stringContaining('Nutrição'), email: true,
    }));
    expect(await screen.findByText(/Enviado: push em 1 de 1 dispositivo\(s\). E-mail: 2 de 2./)).toBeTruthy();
  });

  it('desmarcar alguém tira do envio; trocar o período recarrega', async () => {
    wrap(<Dormant />);
    fireEvent.click(await screen.findByLabelText('Selecionar bia@x.com'));
    fireEvent.click(screen.getByText('Enviar para 1 selecionado(s)'));
    await waitFor(() => expect(lib.sendToDormant).toHaveBeenCalledWith(expect.objectContaining({ ids: ['u1'] })));

    fireEvent.change(screen.getByLabelText('Sumidos há'), { target: { value: '30' } });
    await waitFor(() => expect(lib.fetchDormant).toHaveBeenLastCalledWith(30));
  });

  it('liga o envio automático', async () => {
    wrap(<Dormant />);
    expect(await screen.findByText('Desligado')).toBeTruthy();
    fireEvent.click(screen.getByText('Ligar envio automático'));
    await waitFor(() => expect(lib.setDormantRuleEnabled).toHaveBeenCalledWith(true));
    expect(await screen.findByText('Ligado')).toBeTruthy();
  });

  it('erro ao carregar aparece na tela', async () => {
    lib.fetchDormant.mockRejectedValue(new Error('not_authorized'));
    wrap(<Dormant />);
    expect(await screen.findByText('not_authorized')).toBeTruthy();
  });
});
