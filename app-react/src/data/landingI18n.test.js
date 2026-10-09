// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Guarda: todo texto visível das páginas escritas à mão do site (a home, a
// 404 e cada pasta de public/landing com index.html) tem inglês em
// public/landing/i18n-en.js, ou está na lista dos que não mudam: nomes,
// números, e-mail. Vale também pro título e pras descrições do <head>.
// Texto novo sem tradução faz o teste falhar. As páginas geradas da biblioteca
// de exercícios têm dicionário próprio (scripts/build-site.test.js).
const dir = path.resolve(process.cwd(), 'public/landing');
const pages = ['index.html', '404.html', ...fs.readdirSync(dir, { withFileTypes: true })
  .filter(d => d.isDirectory() && d.name !== 'exercicios' && fs.existsSync(path.join(dir, d.name, 'index.html')))
  .map(d => `${d.name}/index.html`)];
const dictSrc = fs.readFileSync(path.join(dir, 'i18n-en.js'), 'utf8');

const win = {};
new Function('window', dictSrc)(win);
const dict = win.LANDING_EN;

const norm = s => s.replace(/\s+/g, ' ').trim();
const docs = pages.map(p => new DOMParser().parseFromString(fs.readFileSync(path.join(dir, p), 'utf8'), 'text/html'));

const SAME = new Set([
  'EAFIT', 'EA', 'App', 'wger.de', 'Free Exercise DB', 'contato.eafit@gmail.com', 'eafit.com.br/app', 'P7K2QX',
  'Rafael', 'Mariana', 'Carlos', 'Rafa', 'Bruno', 'Carol', 'Lia', 'Cardio',
  'EN', '26 kg', '140 kg', '110 kg', '36 kg', '+200ml', '+300ml', '+500ml', '+750ml', '· CC BY-SA 4.0',
]);
const noLetters = t => !/[A-Za-zÀ-ú]{2}/.test(t);
const HEAD_TEXTS = ['meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:description"]',
  'meta[name="twitter:title"]', 'meta[name="twitter:description"]'];

function visibleTexts() {
  const out = new Set();
  for (const doc of docs) {
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(n.parentNode.nodeName)) continue;
      const t = norm(n.nodeValue);
      if (t && !noLetters(t)) out.add(t);
    }
    out.add(norm(doc.title));
    for (const sel of HEAD_TEXTS) out.add(norm(doc.querySelector(sel).getAttribute('content')));
  }
  return out;
}

describe('site em inglês', () => {
  it('enxerga todas as páginas escritas à mão', () => {
    expect(pages.length).toBeGreaterThanOrEqual(5);
  });

  it('todo texto visível tem tradução', () => {
    const missing = [...visibleTexts()].filter(t => !(t in dict.text) && !SAME.has(t));
    expect(missing).toEqual([]);
  });

  it('todo atributo de acessibilidade tem tradução', () => {
    const attrs = new Set();
    for (const doc of docs) {
      doc.body.querySelectorAll('[alt],[aria-label],[title],[placeholder]').forEach(el => {
        for (const a of ['alt', 'aria-label', 'title', 'placeholder']) {
          const v = el.getAttribute(a);
          if (v && !noLetters(v)) attrs.add(v);
        }
      });
    }
    // o rótulo do botão de idioma é bilíngue de propósito
    attrs.delete('Idioma: português. Mudar para inglês / Language: Portuguese. Switch to English');
    expect([...attrs].filter(v => !(v in dict.attrs) && !SAME.has(v))).toEqual([]);
  });

  it('o dicionário não tem entradas vazias nem chaves que não existem mais nas páginas', () => {
    const texts = visibleTexts();
    const empty = Object.entries(dict.text).filter(([, v]) => !v || !v.trim()).map(([k]) => k);
    expect(empty).toEqual([]);
    // textos que só aparecem via JS (faixa de números, botão do vídeo) ou vindos do admin
    const dynamic = new Set(['pessoas treinando', 'treinos concluídos', 'séries registradas', '▶ Reproduzir', 'Perfil',
      'Enviando…', 'Mensagem enviada. A resposta chega no seu e-mail.', 'Não deu pra enviar agora. Tente de novo ou escreva para contato.eafit@gmail.com.']);
    const orphans = Object.keys(dict.text).filter(k => !texts.has(k) && !dynamic.has(k));
    expect(orphans).toEqual([]);
  });
});
