import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Campo numérico sem inputMode abre, no celular, um teclado genérico (iOS: com
// letras e símbolos). Toda <input type="number"> declara o teclado: "numeric"
// para inteiros e "decimal" para o que aceita casas.
function sources(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.jsx$/.test(name) && !/\.test\.jsx$/.test(name) ? [p] : [];
  });
}

describe('campos numéricos no celular', () => {
  it('todo <input type="number"> declara inputMode numeric ou decimal', () => {
    const missing = [];
    for (const file of sources('src')) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/<input\b[\s\S]*?\/>/g)) {
        if (!/type=["']number["']/.test(m[0])) continue;
        if (!/inputMode=["'](numeric|decimal)["']/.test(m[0])) {
          missing.push(`${file}:${text.slice(0, m.index).split('\n').length}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
