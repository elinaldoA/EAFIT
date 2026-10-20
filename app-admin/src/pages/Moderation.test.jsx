// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockRpc, mockFrom, upsert, words } = vi.hoisted(() => ({ mockRpc: vi.fn(), mockFrom: vi.fn(), upsert: vi.fn(), words: { value: ['idiota'] } }));
vi.mock('../lib/supabase', () => ({ db: { rpc: mockRpc, from: mockFrom } }));
vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => ({ adminUser: { id: 'adm1' } }) }));

import Moderation from './Moderation';
import { parseWords } from '../lib/moderation';

const REPORT = {
  fr_event: 900, fr_user: 'u2', fr_user_name: 'Bia', fr_snapshot: 'Bia: Treino idiota', fr_reasons: ['ofensivo', 'spam'],
  fr_notes: ['nome feio'], fr_reports: 2, fr_first: '2026-10-19T10:00:00Z', fr_last: '2026-10-20T10:00:00Z', fr_status: 'aberta',
  fr_user_reports: 3, fr_blocked: false, fr_event_exists: true,
};
const FLAG = { ff_event: 901, ff_user: 'u3', ff_name: 'Caio', ff_text: 'Treino idiota 2', ff_word: 'idiota', ff_at: '2026-10-20T09:00:00Z', ff_blocked: false };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  upsert.mockResolvedValue({ error: null });
  mockRpc.mockImplementation(async name => ({
    data: name === 'admin_feed_reports' ? [REPORT] : name === 'admin_feed_flags' ? [FLAG] : null, error: null,
  }));
  mockFrom.mockImplementation(table => (table === 'app_settings'
    ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: { words: words.value } }, error: null }) }) }), upsert }
    : { insert: vi.fn().mockResolvedValue({ error: null }) }));
});
afterEach(cleanup);

describe('moderation', () => {
  it('parseWords limpa, separa e tira repetidas', () => {
    expect(parseWords('Idiota, burro\n idiota \n x')).toEqual(['idiota', 'burro']);
  });

  it('denúncia agrupada: remover apaga a publicação e resolve; bloquear tira do feed', async () => {
    render(<MemoryRouter><Moderation /></MemoryRouter>);
    expect(await screen.findByText('Bia: Treino idiota')).toBeTruthy();
    expect(screen.getByText('Ofensivo, Spam')).toBeTruthy();
    expect(screen.getByText('3 denúncia(s) contra a pessoa no total')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Remover publicação' }));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('admin_delete_feed_event', { p_id: 900 }));
    expect(mockRpc).toHaveBeenCalledWith('admin_resolve_feed_reports', { p_event: 900, p_user: 'u2', p_status: 'removida' });

    fireEvent.click(await screen.findByRole('button', { name: 'Bloquear no feed' }));
    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith('admin_set_feed_block', { p_user: 'u2', p_blocked: true }));
    expect(mockRpc).toHaveBeenCalledWith('admin_resolve_feed_reports', { p_event: 900, p_user: 'u2', p_status: 'bloqueado' });
  });

  it('sinalizados mostram a palavra e as palavras são salvas', async () => {
    render(<MemoryRouter><Moderation /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /Sinalizados/ }));
    expect(await screen.findByText('Treino idiota 2')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Palavras bloqueadas'), { target: { value: 'idiota\nburro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ key: 'feed_blocked_words', value: { words: ['idiota', 'burro'] } })));
  });
});
