import { describe, it, expect } from 'vitest';
import { qrModules, qrSvgPath, drawQr } from './qr';

const URL_ = 'https://eafit.com.br/?ref=anafit&origem=qr';

describe('qr', () => {
  it('gera uma matriz quadrada com os três quadrados de posição', () => {
    const m = qrModules(URL_);
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect(m.every(row => row.length === m.length)).toBe(true);
    const n = m.length;
    for (const [r, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      expect(m[r][c] && m[r + 6][c + 6] && m[r + 3][c + 3]).toBe(true); // borda e centro escuros
      expect(m[r + 1][c + 1]).toBe(false); // anel claro
    }
  });

  it('o caminho SVG desenha um quadrado por módulo escuro', () => {
    const { size, d } = qrSvgPath(URL_);
    const dark = qrModules(URL_).flat().filter(Boolean).length;
    expect(size).toBe(qrModules(URL_).length);
    expect(d.match(/M/g)).toHaveLength(dark);
  });

  it('desenha no canvas só os módulos escuros', () => {
    const calls = [];
    const ctx = { fillRect: (...a) => calls.push(a), fillStyle: '' };
    drawQr(ctx, URL_, 10, 20, 290, '#111');
    expect(calls).toHaveLength(qrModules(URL_).flat().filter(Boolean).length);
    expect(ctx.fillStyle).toBe('#111');
    expect(calls[0].slice(0, 2)).toEqual([10, 20]);
  });
});
