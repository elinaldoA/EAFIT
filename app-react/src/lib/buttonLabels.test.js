import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Botão sem texto visível (só ícone/svg/símbolo) precisa de aria-label ou title,
// senão o leitor de tela anuncia só "botão".
function sources(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.jsx$/.test(name) && !/\.test\.jsx$/.test(name) ? [p] : [];
  });
}

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

describe('botões com nome acessível', () => {
  it('todo <button> tem texto, aria-label ou title', () => {
    const unnamed = [];
    for (const file of sources('src')) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/<button\b/g)) {
        const end = tagEnd(text, m.index + m[0].length);
        const tag = text.slice(m.index, end);
        if (/aria-label|aria-labelledby|\btitle=/.test(tag)) continue;
        const close = text.indexOf('</button>', end);
        if (close === -1) continue;
        const inner = text.slice(end, close)
          .replace(/<svg[\s\S]*?<\/svg>/g, '')
          .replace(/<[^>]*>/g, '');
        // texto escrito (2+ letras) ou expressão ({t(...)}, {label}) que gera texto
        if (/[A-Za-zÀ-ÿ]{2,}/.test(inner) || inner.includes('{')) continue;
        unnamed.push(`${file}:${text.slice(0, m.index).split('\n').length}`);
      }
    }
    expect(unnamed).toEqual([]);
  });
});
