// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Guarda: todo texto visível da landing estática tem inglês em
// public/landing/i18n-en.js (ou está na lista dos que não mudam: nomes,
// números, e-mail). Texto novo sem tradução faz o teste falhar.
const dir = path.resolve(process.cwd(), 'public/landing');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const dictSrc = fs.readFileSync(path.join(dir, 'i18n-en.js'), 'utf8');

const win = {};
new Function('window', dictSrc)(win);
const dict = win.LANDING_EN;

const norm = s => s.replace(/\s+/g, ' ').trim();
const doc = new DOMParser().parseFromString(html, 'text/html');

const SAME = new Set([
  'EAFIT', 'EA', 'wger.de', 'Free Exercise DB', 'naldoads17@gmail.com', 'eafit.com.br/app', 'P7K2QX',
  'Rafael', 'Mariana', 'Carlos', 'Rafa', 'Bruno', 'Carol', 'Lia',
  'EN', '26 kg', '140 kg', '110 kg', '36 kg', '+200ml', '+300ml', '+500ml', '+750ml', '· CC BY-SA 4.0',
]);
const noLetters = t => !/[A-Za-zÀ-ú]{2}/.test(t);

function visibleTexts() {
  const out = new Set();
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(n.parentNode.nodeName)) continue;
    const t = norm(n.nodeValue);
    if (t && !noLetters(t)) out.add(t);
  }
  return out;
}

describe('landing em inglês', () => {
  it('todo texto visível tem tradução', () => {
    const missing = [...visibleTexts()].filter(t => !(t in dict.text) && !SAME.has(t));
    expect(missing).toEqual([]);
  });

  it('todo atributo de acessibilidade tem tradução', () => {
    const attrs = new Set();
    doc.body.querySelectorAll('[alt],[aria-label],[title],[placeholder]').forEach(el => {
      for (const a of ['alt', 'aria-label', 'title', 'placeholder']) {
        const v = el.getAttribute(a);
        if (v && !noLetters(v)) attrs.add(v);
      }
    });
    // o rótulo do botão de idioma é bilíngue de propósito
    attrs.delete('Idioma: português. Mudar para inglês / Language: Portuguese. Switch to English');
    expect([...attrs].filter(v => !(v in dict.attrs) && !SAME.has(v))).toEqual([]);
  });

  it('o dicionário não tem entradas vazias nem chaves que não existem mais na página', () => {
    const texts = visibleTexts();
    const empty = Object.entries(dict.text).filter(([, v]) => !v || !v.trim()).map(([k]) => k);
    expect(empty).toEqual([]);
    // textos que só aparecem via JS (faixa de números) ou vindos do admin
    const dynamic = new Set(['pessoas treinando', 'treinos concluídos', 'séries registradas', 'EAFIT — Treino com plano, registro e evolução', 'Perfil']);
    const orphans = Object.keys(dict.text).filter(k => !texts.has(k) && !dynamic.has(k));
    expect(orphans).toEqual([]);
  });
});
