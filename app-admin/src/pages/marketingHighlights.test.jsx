// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

const { lib, video } = vi.hoisted(() => ({
  lib: { fetchAccounts: vi.fn(), uploadMedia: vi.fn(), createPost: vi.fn() },
  video: { canRenderReels: vi.fn(), renderHighlight: vi.fn() },
}));
vi.mock('../lib/supabase', () => ({ db: {} }));
vi.mock('../context/useAdminAuth', () => ({ useAdminAuth: () => ({ adminUser: { id: 'admin-1' } }) }));
vi.mock('../lib/marketing', async orig => ({ ...(await orig()), ...lib }));
vi.mock('../lib/reelVideo', () => video);

import MarketingHighlights from './MarketingHighlights';
import { HIGHLIGHTS, COVER_W, COVER_H, drawCover } from '../lib/highlightCovers';
import { HIGHLIGHT_SCRIPTS } from '../lib/highlightScripts';
import { SCENE_SECONDS, drawHighlightFrame, highlightSeconds } from '../lib/highlightVideo';
import { FLOWS, flowSeconds } from '../lib/highlightFlows';

// Contexto de canvas falso: só registra as chamadas (jsdom não desenha).
function fakeCtx() {
  const calls = [];
  const grad = { addColorStop() {} };
  return new Proxy({ calls }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => grad;
      if (prop === 'measureText') return t => ({ width: String(t).length * 20 });
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
  lib.uploadMedia.mockResolvedValue({ path: 'p', url: 'https://cdn/destaque.mp4' });
  lib.createPost.mockResolvedValue('post');
  video.canRenderReels.mockReturnValue(true);
  video.renderHighlight.mockImplementation(async ({ scenes, onProgress }) => {
    onProgress?.(1);
    return { blob: new Blob(['v'], { type: 'video/mp4' }), width: 1080, height: 1920, seconds: Math.round(scenes.length * 4.5) };
  });
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
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

describe('Vídeo do destaque', () => {
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

  it('duração: 4,5 s por cena e nenhum destaque passa de 60 s (limite de story)', () => {
    expect(SCENE_SECONDS).toBe(4.5);
    expect(highlightSeconds(5)).toBe(23);
    for (const items of Object.values(HIGHLIGHT_SCRIPTS)) expect(highlightSeconds(items)).toBeLessThanOrEqual(60);
  });

  it('Como começar é a gravação do app em uso: intro, fluxo real com legendas por etapa e fecho', () => {
    const scenes = HIGHLIGHT_SCRIPTS.comecar;
    const flow = scenes.find(sc => sc.flow);
    expect(flow.flow).toBe('comecar');
    expect(flow.chapters.map(c => c.at)).toEqual([0, 10.8, 19.9]);
    expect(flow.chapters.every(c => c.at < flowSeconds('comecar'))).toBe(true);
    // todo quadro da gravação existe no atlas
    const { cols, steps } = FLOWS.comecar;
    const cells = steps.map(([cell]) => cell);
    expect(Math.max(...cells)).toBeLessThan(cols * Math.ceil((Math.max(...cells) + 1) / cols));
    expect(steps.every(([, d]) => d > 0)).toBe(true);
    expect(highlightSeconds(scenes)).toBe(Math.ceil(3.5 + flowSeconds('comecar') + 3.5));
  });

  it('desenha cena com print e cena só de texto, em qualquer instante', () => {
    const scenes = HIGHLIGHT_SCRIPTS.comecar;
    const imgs = scenes.map(s => (s.flow ? { width: 4160, height: 10125 } : s.print ? { width: 540, height: 1170 } : null));
    for (const t of [0, 1, 3.5 + 0.2, 3.5 + 5, 3.5 + 12, 3.5 + 22, highlightSeconds(scenes) - 0.04]) {
      const ctx = fakeCtx();
      expect(() => drawHighlightFrame(ctx, scenes, imgs, t)).not.toThrow();
      expect(ctx.calls).toContain('fillRect'); // fundo e barra de progresso
      expect(ctx.calls).toContain('fillText'); // título
    }
  });

  it('gera o vídeo do destaque, mostra a prévia e só agenda depois de confirmar', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<MarketingHighlights />);
    await screen.findByText(/Instagram @eafitapp/);
    const box = within(screen.getByLabelText('Roteiro Como começar'));
    expect(box.queryByRole('button', { name: 'Agendar vídeo' })).toBeNull(); // sem vídeo, não há o que agendar
    fireEvent.click(box.getByRole('button', { name: /Gerar vídeo/ }));
    await waitFor(() => expect(video.renderHighlight).toHaveBeenCalledTimes(1));
    const scenes = video.renderHighlight.mock.calls[0][0].scenes;
    expect(scenes).toHaveLength(HIGHLIGHT_SCRIPTS.comecar.length);
    expect(scenes[0].print).toMatch(/criar-conta/); // print vira URL do site
    expect(scenes[1].atlas).toMatch(/flow-comecar\.webp$/); // gravação do app: um atlas de quadros
    expect(scenes[2].print).toBeNull(); // cena só de texto
    expect(await box.findByLabelText('Prévia Como começar')).toBeTruthy();

    fireEvent.click(box.getByRole('button', { name: 'Agendar vídeo' }));
    await waitFor(() => expect(lib.createPost).toHaveBeenCalledTimes(1));
    const post = lib.createPost.mock.calls[0][0];
    expect(post.format).toBe('story');
    expect(post.caption).toBe('');
    expect(post.media).toEqual([{ type: 'video', url: 'https://cdn/destaque.mp4' }]);
    expect(post.accountIds).toEqual(['ig1']); // só o Instagram vem marcado
    expect(lib.uploadMedia.mock.calls[0][0].file.type).toBe('video/mp4');
    expect(await screen.findByText(/Vídeo de “Como começar” agendado/)).toBeTruthy();
  });

  it('não agenda nada se a pessoa cancelar a confirmação', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<MarketingHighlights />);
    await screen.findByText(/Instagram @eafitapp/);
    const box = within(screen.getByLabelText('Roteiro Treinos'));
    fireEvent.click(box.getByRole('button', { name: /Gerar vídeo/ }));
    fireEvent.click(await box.findByRole('button', { name: 'Agendar vídeo' }));
    await new Promise(r => setTimeout(r, 30));
    expect(lib.uploadMedia).not.toHaveBeenCalled();
    expect(lib.createPost).not.toHaveBeenCalled();
  });

  it('cada destaque tem seu dia: o horário padrão avança um dia por destaque, às 9h', async () => {
    render(<MarketingHighlights />);
    await screen.findByText(/Instagram @eafitapp/);
    const dayOf = async label => {
      const box = within(screen.getByLabelText(`Roteiro ${label}`));
      fireEvent.click(box.getByRole('button', { name: /Gerar vídeo/ }));
      return (await box.findByLabelText(`Horário ${label}`)).value;
    };
    const a = await dayOf('Como começar');
    const b = await dayOf('Treinos');
    expect(a.endsWith('T09:00')).toBe(true);
    expect(new Date(b) - new Date(a)).toBe(86_400_000);
  });

  it('erro na geração aparece e não deixa agendar', async () => {
    video.renderHighlight.mockRejectedValue(new Error('Este navegador não gera vídeo.'));
    render(<MarketingHighlights />);
    await screen.findByText(/Instagram @eafitapp/);
    const box = within(screen.getByLabelText('Roteiro Nutrição'));
    fireEvent.click(box.getByRole('button', { name: /Gerar vídeo/ }));
    expect(await screen.findByText(/Erro: Este navegador não gera vídeo/)).toBeTruthy();
    expect(box.queryByRole('button', { name: 'Agendar vídeo' })).toBeNull();
  });

  it('navegador sem suporte a vídeo avisa e desliga o botão', async () => {
    video.canRenderReels.mockReturnValue(false);
    render(<MarketingHighlights />);
    await screen.findByText(/Instagram @eafitapp/);
    expect(screen.getByText(/Este navegador não gera vídeo\. Abra o painel no Chrome/)).toBeTruthy();
    expect(within(screen.getByLabelText('Roteiro Personal')).getByRole('button', { name: /Gerar vídeo/ }).disabled).toBe(true);
  });
});
