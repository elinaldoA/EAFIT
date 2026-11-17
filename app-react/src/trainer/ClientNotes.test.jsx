// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

const h = vi.hoisted(() => ({ toast: vi.fn(), api: {} }));

vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useToast', () => ({ useToast: () => h.toast }));
vi.mock('../lib/trainerInsights', async (importActual) => ({
  ...(await importActual()),
  fetchNotes: (...a) => h.api.fetchNotes(...a),
  addNote: (...a) => h.api.addNote(...a),
  deleteNote: (...a) => h.api.deleteNote(...a),
}));

import ClientNotes from './ClientNotes';

beforeEach(() => {
  h.toast.mockReset();
  h.api = {
    fetchNotes: vi.fn().mockResolvedValue([{ id: 'n1', body: 'Dor no ombro', at: '2026-10-05T10:00:00Z' }]),
    addNote: vi.fn().mockResolvedValue(undefined),
    deleteNote: vi.fn().mockResolvedValue(undefined),
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const box = () => screen.getByLabelText('Nova anotação');

describe('ClientNotes', () => {
  it('lista as anotações do aluno', async () => {
    render(<ClientNotes clientId="c1" />);
    expect(await screen.findByText('Dor no ombro')).toBeTruthy();
    expect(h.api.fetchNotes).toHaveBeenCalledWith('c1');
  });

  it('falha ao buscar mostra a caixa vazia', async () => {
    h.api.fetchNotes.mockRejectedValue(new Error('x'));
    render(<ClientNotes clientId="c1" />);
    await waitFor(() => expect(h.api.fetchNotes).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Salvar anotação' })).toBeTruthy();
  });

  it('salvar fica desabilitado sem texto', async () => {
    render(<ClientNotes clientId="c1" />);
    await screen.findByText('Dor no ombro');
    expect(screen.getByRole('button', { name: 'Salvar anotação' }).disabled).toBe(true);
    fireEvent.change(box(), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Salvar anotação' }).disabled).toBe(true);
  });

  it('adiciona a anotação sem espaços sobrando, limpa o campo e recarrega', async () => {
    render(<ClientNotes clientId="c1" />);
    await screen.findByText('Dor no ombro');
    fireEvent.change(box(), { target: { value: '  Evitar agachamento  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar anotação' }));
    await waitFor(() => expect(h.api.addNote).toHaveBeenCalledWith('c1', 'Evitar agachamento'));
    expect(box().value).toBe('');
    await waitFor(() => expect(h.api.fetchNotes).toHaveBeenCalledTimes(2));
  });

  it('erro ao salvar aparece e mantém o texto', async () => {
    h.api.addNote.mockRejectedValue(new Error('not_authorized'));
    render(<ClientNotes clientId="c1" />);
    await screen.findByText('Dor no ombro');
    fireEvent.change(box(), { target: { value: 'Algo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar anotação' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(box().value).toBe('Algo');
  });

  it('apagar some na hora, sem confirmação, e só apaga no servidor em 6s', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    render(<ClientNotes clientId="c1" />);
    await screen.findByText('Dor no ombro');
    const btn = screen.getByRole('button', { name: 'Apagar anotação' });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fireEvent.click(btn);
      expect(confirm).not.toHaveBeenCalled();
      expect(screen.queryByText('Dor no ombro')).toBeNull();
      expect(h.toast).toHaveBeenCalledWith('Anotação apagada', 6000, expect.objectContaining({ action: expect.objectContaining({ label: 'Desfazer' }) }));
      expect(h.api.deleteNote).not.toHaveBeenCalled();
      await act(async () => { await vi.advanceTimersByTimeAsync(6100); });
      expect(h.api.deleteNote).toHaveBeenCalledWith('n1');
    } finally { vi.useRealTimers(); }
  });

  it('Desfazer devolve a anotação e nada é apagado', async () => {
    render(<ClientNotes clientId="c1" />);
    await screen.findByText('Dor no ombro');
    const btn = screen.getByRole('button', { name: 'Apagar anotação' });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fireEvent.click(btn);
      act(() => { h.toast.mock.calls.at(-1)[2].action.onClick(); });
      expect(screen.getByText('Dor no ombro')).toBeTruthy();
      await act(async () => { await vi.advanceTimersByTimeAsync(7000); });
      expect(h.api.deleteNote).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('erro ao apagar avisa e a anotação volta', async () => {
    h.api.deleteNote.mockRejectedValue(new Error('x'));
    render(<ClientNotes clientId="c1" />);
    await screen.findByText('Dor no ombro');
    const btn = screen.getByRole('button', { name: 'Apagar anotação' });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fireEvent.click(btn);
      await act(async () => { await vi.advanceTimersByTimeAsync(6100); });
      expect(h.toast).toHaveBeenCalledWith('❌ Não foi possível apagar');
    } finally { vi.useRealTimers(); }
    expect(await screen.findByText('Dor no ombro')).toBeTruthy();
  });
});
