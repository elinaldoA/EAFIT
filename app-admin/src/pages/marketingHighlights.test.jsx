// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import MarketingHighlights from './MarketingHighlights';
import { HIGHLIGHTS, COVER_W, COVER_H, drawCover } from '../lib/highlightCovers';

afterEach(cleanup);

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

describe('Destaques do Instagram', () => {
  it('lista as cinco capas e deixa a Corrida de fora', () => {
    render(<MarketingHighlights />);
    for (const label of ['Como começar', 'Treinos', 'Nutrição', 'Evolução', 'Personal']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText('Corrida')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Baixar capa' })).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Baixar todas' })).toBeTruthy();
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
