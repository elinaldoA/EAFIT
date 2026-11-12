// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

const { lib } = vi.hoisted(() => ({
  lib: {
    fetchAccounts: vi.fn(), createArt: vi.fn(), createTextArt: vi.fn(), uploadMedia: vi.fn(), createPost: vi.fn(),
  },
}));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => ({ adminUser: { id: 'admin-1' } }) }));
vi.mock('../lib/marketing', async orig => ({ ...(await orig()), ...lib }));

import MarketingHighlights from './MarketingHighlights';
import { HIGHLIGHTS, COVER_W, COVER_H, drawCover } from '../lib/highlightCovers';
import { HIGHLIGHT_SCRIPTS, highlightSchedule } from '../lib/highlightScripts';

// Contexto de canvas falso: só registra as chamadas (jsdom não desenha).
function fakeCtx() {
  const calls = [];
  const grad = { addColorStop() {} };
  return new Proxy({ calls }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => grad;
      return (...args) => { calls.push(String(prop)); return args[0]; };
    },
    set() { return true; },
  });
}

const ACCOUNTS = [
  { id: 'ig1', platform: 'instagram', username: 'eafitapp', status: 'ok' },
  { id: 'fb1', platform: 'facebook', name: 'EAFIT', status: 'ok' },
  { id: 'tt1', platform: 'tiktok', username: 'eafit', status: 'ok' },
];

beforeEach(() => {
  lib.fetchAccounts.mockResolvedValue(ACCOUNTS);
  lib.createArt.mockResolvedValue({ blob: new Blob(['x']), width: 1080, height: 1920 });
  lib.createTextArt.mockResolvedValue({ blob: new Blob(['x']), width: 1080, height: 1920 });
  lib.uploadMedia.mockImplementation(async ({ title }) => ({ path: 'p', url: `https://cdn/${title}.jpg` }));
  lib.createPost.mockResolvedValue('post');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe('Destaques do Instagram', () => {
  it('lista as oito capas e deixa a Corrida de fora', async () => {
    render(<MarketingHighlights />);
    for (const label of ['Como começar', 'Treinos', 'Nutrição', 'Evolução', 'Personal', 'Depoimentos', 'Embaixador', 'Influenciador']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText('Corrida')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Baixar capa' })).toHaveLength(8);
    expect(screen.getByRole('button', { name: 'Baixar todas' })).toBeTruthy();
    await screen.findByText(/Instagram @eafitapp/);
  });

  it('as capas são 1080x1920 (formato de story/destaque)', () => {
    expect([COVER_W, COVER_H]).toEqual([1080, 1920]);
    render(<MarketingHighlights />);
    const canvas = screen.getByLabelText('Capa Treinos');
    expect([canvas.width, canvas.height]).toEqual([1080, 1920]);
  });

  it('cada capa desenha fundo, anel e ícone; capa desconhecida dá erro', () => {
    for (const h of HIGHLIGHTS) {
      const ctx = fakeCtx();
      drawCover(ctx, h.key);
      expect(ctx.calls).toContain('fillRect'); // fundo
      expect(ctx.calls).toContain('arc'); // anel
      expect(ctx.calls.filter(c => c === 'fill' || c === 'stroke').length).toBeGreaterThan(2);
    }
    expect(() => drawCover(fakeCtx(), 'corrida')).toThrow(/desconhecida/);
  });
});

describe('Roteiro dos destaques', () => {
  it('roteiro: sem Corrida, sem Depoimentos, só destaques que existem como capa', () => {
    const covers = new Set(HIGHLIGHTS.map(h => h.key));
    for (const [key, items] of Object.entries(HIGHLIGHT_SCRIPTS)) {
      expect(covers.has(key)).toBe(true);
      expect(items.length).toBeGreaterThan(2);
      for (const item of items) {
        expect(item.print === null || !String(item.print).startsWith('run-')).toBe(true);
        expect(`${item.headline} ${item.subline}`.toLowerCase()).not.toMatch(/corrida|correr/);
      }
    }
    expect(HIGHLIGHT_SCRIPTS.depoimentos).toBeUndefined();
  });

  it('horários: um story a cada intervalo a partir do primeiro', () => {
    const t = highlightSchedule('2026-11-13T12:00:00.000Z', 3, 90);
    expect(t).toEqual(['2026-11-13T12:00:00.000Z', '2026-11-13T13:30:00.000Z', '2026-11-13T15:00:00.000Z']);
    expect(highlightSchedule('lixo', 3)).toEqual([]);
  });

  it('agenda os stories do destaque (arte, upload e post agendado em cada um) só depois de confirmar', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MarketingHighlights />);
    await screen.findByText(/Instagram @eafitapp/);
    const total = HIGHLIGHT_SCRIPTS.nutricao.length;
    const box = within(screen.getByLabelText('Roteiro Nutrição'));
    fireEvent.click(box.getByRole('button', { name: `Agendar ${total} stories` }));
    await waitFor(() => expect(lib.createPost).toHaveBeenCalledTimes(total));
    expect(lib.createArt).toHaveBeenCalledTimes(total); // todos os de nutrição usam print
    expect(lib.createTextArt).not.toHaveBeenCalled();
    const first = lib.createPost.mock.calls[0][0];
    expect(first.format).toBe('story');
    expect(first.caption).toBe('');
    expect(first.accountIds).toEqual(['ig1']); // só o Instagram vem marcado
    const times = lib.createPost.mock.calls.map(c => new Date(c[0].scheduledAt).getTime());
    expect(times[1] - times[0]).toBe(60 * 60_000);
    expect(await screen.findByText(new RegExp(`${total} stories de “Nutrição” agendados`))).toBeTruthy();
  });

  it('arte só de texto quando o story não tem print', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MarketingHighlights />);
    await screen.findByText(/Instagram @eafitapp/);
    const total = HIGHLIGHT_SCRIPTS.embaixador.length;
    fireEvent.click(within(screen.getByLabelText('Roteiro Embaixador')).getByRole('button', { name: `Agendar ${total} stories` }));
    await waitFor(() => expect(lib.createPost).toHaveBeenCalledTimes(total));
    expect(lib.createTextArt).toHaveBeenCalledTimes(total);
    expect(lib.createArt).not.toHaveBeenCalled();
  });

  it('não agenda nada se a pessoa cancelar a confirmação', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<MarketingHighlights />);
    await screen.findByText(/Instagram @eafitapp/);
    const total = HIGHLIGHT_SCRIPTS.treinos.length;
    fireEvent.click(within(screen.getByLabelText('Roteiro Treinos')).getByRole('button', { name: `Agendar ${total} stories` }));
    await new Promise(r => setTimeout(r, 30));
    expect(lib.createPost).not.toHaveBeenCalled();
    expect(lib.uploadMedia).not.toHaveBeenCalled();
  });

  it('erro no meio avisa quantos já foram agendados', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    lib.createPost.mockResolvedValueOnce('ok').mockRejectedValueOnce(new Error('A Meta recusou'));
    render(<MarketingHighlights />);
    await screen.findByText(/Instagram @eafitapp/);
    const total = HIGHLIGHT_SCRIPTS.comecar.length;
    fireEvent.click(within(screen.getByLabelText('Roteiro Como começar')).getByRole('button', { name: `Agendar ${total} stories` }));
    expect(await screen.findByText(/A Meta recusou \(1 de \d+ já foram agendados/)).toBeTruthy();
    expect(lib.createPost).toHaveBeenCalledTimes(2);
  });

  it('sem conta marcada, o botão de agendar fica desligado', async () => {
    render(<MarketingHighlights />);
    const ig = await screen.findByLabelText(/Instagram @eafitapp/);
    fireEvent.click(ig);
    const total = HIGHLIGHT_SCRIPTS.personal.length;
    expect(within(screen.getByLabelText('Roteiro Personal')).getByRole('button', { name: `Agendar ${total} stories` }).disabled).toBe(true);
  });
});
