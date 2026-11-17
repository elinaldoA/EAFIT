import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Campo sem nome acessível: o leitor de tela diz só "campo de edição" (o
// placeholder some ao digitar e nem todo leitor o lê). Todo <input>, <select> e
// <textarea> precisa de aria-label/aria-labelledby, de um id (ligado a um
// <label htmlFor>) ou de estar dentro de um <label>.
function sources(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.jsx$/.test(name) && !/\.test\.jsx$/.test(name) ? [p] : [];
  });
}

// Fim da tag respeitando chaves e aspas (o `=>` dentro de onChange não fecha a tag).
function tagEnd(text, from) {
  let depth = 0; let quote = null;
  for (let i = from; i < text.length; i += 1) {
    const c = text[i];
    if (quote) { if (c === quote) quote = null; }
    else if ((c === '"' || c === "'") && depth === 0) quote = c;
    else if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return i + 1;
  }
  return text.length;
}

describe('campos de formulário com nome acessível', () => {
  it('todo input, select e textarea tem aria-label, id ou <label> em volta', () => {
    const unnamed = [];
    for (const file of sources('src')) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/<(input|select|textarea)\b/g)) {
        const tag = text.slice(m.index, tagEnd(text, m.index + m[0].length));
        if (/type=["'](hidden|file)["']/.test(tag)) continue;
        if (/aria-label|aria-labelledby|\bid=/.test(tag)) continue;
        const back = text.slice(Math.max(0, m.index - 400), m.index);
        const open = back.lastIndexOf('<label');
        if (open !== -1 && !back.slice(open).includes('</label>')) continue;
        unnamed.push(`${file}:${text.slice(0, m.index).split('\n').length}`);
      }
    }
    expect(unnamed).toEqual([]);
  });
});
