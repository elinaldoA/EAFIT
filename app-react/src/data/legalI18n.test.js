// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Termos e Privacidade têm os dois idiomas no mesmo arquivo (data-l="pt"/"en").
// Guarda: as duas versões têm a mesma estrutura, pra uma não ficar defasada da outra.
const dir = path.resolve(process.cwd(), 'public/legal');

function load(file) {
  const doc = new DOMParser().parseFromString(fs.readFileSync(path.join(dir, file), 'utf8'), 'text/html');
  const block = lang => doc.querySelector(`div[data-l="${lang}"]`);
  return { doc, pt: block('pt'), en: block('en') };
}

describe.each(['termos.html', 'privacidade.html'])('%s', file => {
  const { doc, pt, en } = load(file);

  it('tem versão em português e em inglês', () => {
    expect(pt).not.toBeNull();
    expect(en).not.toBeNull();
  });

  it('as duas versões têm a mesma estrutura', () => {
    for (const sel of ['h2', 'p', 'li', 'tr', 'a']) {
      expect(en.querySelectorAll(sel).length, sel).toBe(pt.querySelectorAll(sel).length + (sel === 'p' ? 1 : 0));
    }
  });

  it('a versão em inglês avisa que a em português prevalece', () => {
    expect(en.querySelector('.notice').textContent).toMatch(/Portuguese version prevails/);
  });

  it('o e-mail de contato é o mesmo nas duas', () => {
    const mail = el => el.textContent.match(/[\w.]+@[\w.]+/g);
    expect(mail(en)).toEqual(mail(pt));
  });

  it('há seletor de idioma e título nos dois idiomas', () => {
    expect(doc.getElementById('lang-toggle')).not.toBeNull();
    expect(fs.readFileSync(path.join(dir, file), 'utf8')).toMatch(/document\.title = lang === 'en'/);
  });
});
