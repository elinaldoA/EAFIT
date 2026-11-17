import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const STYLES = 'src/styles';
const css = name => readFileSync(join(STYLES, name), 'utf8');

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const block = (text, selector) => text.slice(text.indexOf(selector)).match(/\{([\s\S]*?)\n\}/)[1];
const token = (blockText, name) => blockText.match(new RegExp(`${name}:\s*([^;]+);`))?.[1].trim();

describe('contorno de foco do teclado', () => {
  const tokens = css('tokens.css');

  it('no tema claro usa o laranja escurecido, com ≥ 3:1 (WCAG 1.4.11) sobre todos os fundos', () => {
    const light = block(tokens, '[data-theme="light"] {');
    expect(token(light, '--focus-outline')).toBe('var(--primary-text)');
    const ring = token(light, '--primary-text');
    for (const bg of ['--bg', '--surface', '--surface-2', '--surface-3']) {
      expect(contrast(ring, token(light, bg))).toBeGreaterThanOrEqual(3);
    }
  });

  it('no escuro usa o laranja claro, com ≥ 3:1 sobre os fundos', () => {
    const root = block(tokens, ':root {');
    expect(token(root, '--focus-outline')).toBe('var(--primary-h)');
    const ring = token(root, '--primary-h');
    for (const bg of ['--bg', '--surface', '--surface-2', '--surface-3']) {
      expect(contrast(ring, token(root, bg))).toBeGreaterThanOrEqual(3);
    }
  });

  it('nenhum contorno de foco usa a cor do tema direto (fica claro demais no tema claro)', () => {
    const offenders = [];
    for (const file of readdirSync(STYLES).filter(f => f.endsWith('.css'))) {
      css(file).split('\n').forEach((line, i) => {
        if (/outline:\s*\d+px solid var\(--primary(-h)?\)/.test(line)) offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
