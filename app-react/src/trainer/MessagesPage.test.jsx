// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ api: {}, composer: vi.fn() }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../lib/trainer', () => ({ fetchClients: (...a) => h.api.fetchClients(...a) }));
vi.mock('../lib/trainerMessages', async (importActual) => ({
  ...(await importActual()),
  fetchSentMessages: (...a) => h.api.fetchSentMessages(...a),
}));
vi.mock('./MessageComposer', () => ({
  default: (props) => {
    h.composer(props);
    return <button type="button" onClick={props.onSent}>{props.label}</button>;
  },
}));

import MessagesPage from './MessagesPage';

const CLIENTS = [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Bruno' }];
const SENT = [
  { id: 1, clientId: 'a', name: 'Ana', body: 'Bom treino', kind: 'recado', at: '2026-10-05T12:00:00Z', read: true },
  { id: 2, clientId: 'b', name: 'Bruno', body: 'Bom treino', kind: 'recado', at: '2026-10-05T12:00:00Z', read: false },
];

beforeEach(() => {
  h.composer.mockReset();
  h.api = {
    fetchClients: vi.fn().mockResolvedValue(CLIENTS),
    fetchSentMessages: vi.fn().mockResolvedValue([]),
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MessagesPage', () => {
  it('por padrão envia para todos os alunos', async () => {
    render(<MessagesPage />);
    expect(await screen.findByRole('button', { name: 'Enviar para todos' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Todos os alunos' }).getAttribute('aria-pressed')).toBe('true');
    expect(h.composer).toHaveBeenLastCalledWith(expect.objectContaining({ clientIds: [] }));
  });

  it('escolher alunos específicos troca o destinatário e o rótulo; voltar a "todos" limpa', async () => {
    render(<MessagesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ana' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bruno' }));
    expect(screen.getByRole('button', { name: 'Enviar para 2 aluno(s)' })).toBeTruthy();
    expect(h.composer).toHaveBeenLastCalledWith(expect.objectContaining({ clientIds: ['a', 'b'] }));

    fireEvent.click(screen.getByRole('button', { name: 'Ana' }));
    expect(h.composer).toHaveBeenLastCalledWith(expect.objectContaining({ clientIds: ['b'] }));

    fireEvent.click(screen.getByRole('button', { name: 'Todos os alunos' }));
    expect(screen.getByRole('button', { name: 'Enviar para todos' })).toBeTruthy();
  });

  it('sem alunos não mostra o compositor', async () => {
    h.api.fetchClients.mockResolvedValue([]);
    render(<MessagesPage />);
    expect(await screen.findByText('Você ainda não tem alunos vinculados.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Enviar para/ })).toBeNull();
  });

  it('histórico agrupa por mensagem e conta quantos leram', async () => {
    h.api.fetchSentMessages.mockResolvedValue(SENT);
    render(<MessagesPage />);
    expect(await screen.findByText('Bom treino')).toBeTruthy();
    expect(screen.getByText('1/2 leram')).toBeTruthy();
    expect(screen.getByText('Para Ana e Bruno')).toBeTruthy();
  });

  it('sem recados enviados mostra o vazio', async () => {
    render(<MessagesPage />);
    expect(await screen.findByText('Nenhum recado enviado ainda.')).toBeTruthy();
  });

  it('falha ao buscar o histórico cai no vazio', async () => {
    h.api.fetchSentMessages.mockRejectedValue(new Error('x'));
    render(<MessagesPage />);
    expect(await screen.findByText('Nenhum recado enviado ainda.')).toBeTruthy();
  });

  it('depois de enviar o histórico é recarregado', async () => {
    render(<MessagesPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar para todos' }));
    await waitFor(() => expect(h.api.fetchSentMessages).toHaveBeenCalledTimes(2));
  });
});
