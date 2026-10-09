// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GROUPS, loadExercises, loadShell, renderIndex, renderDetail, buildDictionary, buildSitemap } from './build-site.mjs';

// Renderiza ~175 páginas no jsdom: com a suíte inteira rodando em paralelo passa dos 5s padrão.
vi.setConfig({ testTimeout: 60000 });

const dir = path.resolve(process.cwd(), 'public/landing');
const read = rel => fs.readFileSync(path.join(dir, rel), 'utf8');
const handPages = ['index.html', ...fs.readdirSync(dir, { withFileTypes: true })
  .filter(d => d.isDirectory() && d.name !== 'exercicios' && fs.existsSync(path.join(dir, d.name, 'index.html')))
  .map(d => `${d.name}/index.html`)];

const all = loadExercises();
const shell = loadShell();

describe('casca do site', () => {
  // Cabeçalho, rodapé e <head> comuns são repetidos em cada página escrita à
  // mão (não há build): mudou num lugar, tem que mudar em todos.
  it('os blocos compartilhados são idênticos em todas as páginas', () => {
    for (const p of handPages) {
      const html = read(p);
      for (const [name, block] of Object.entries(shell)) {
        expect(html.includes(block), `${p}: bloco site-${name} diferente do da home`).toBe(true);
      }
    }
  });

  it('os links pra grupos da biblioteca apontam pra grupos que existem', () => {
    const ids = new Set(GROUPS.map(g => g.id));
    const links = handPages.flatMap(p => [...read(p).matchAll(/href="\/exercicios\/#([^"]+)"/g)].map(m => m[1]));
    expect(links.length).toBeGreaterThan(0);
    expect(links.filter(id => !ids.has(id))).toEqual([]);
  });
});

describe('biblioteca de exercícios', () => {
  it('lê a biblioteca das migrations e só mantém quem tem demonstração', () => {
    expect(all.length).toBeGreaterThan(150);
    expect(new Set(all.map(ex => ex.slug)).size).toBe(all.length);
    expect(all.every(ex => ex.frames || ex.video)).toBe(true);
    const supino = all.find(ex => ex.nome === 'Supino Reto com Barra');
    // nivel_minimo vem do update da migration, não do insert
    expect(supino).toMatchObject({ slug: 'supino-reto-com-barra', grupo: 'peito', series: '4', nivel: 'intermediario' });
  });

  it('a mídia apontada existe em public/', () => {
    const missing = all.flatMap(ex => [
      ex.frames && `exercicios/${ex.frames}/0.webp`,
      ex.frames && `exercicios/${ex.frames}/1.webp`,
      ex.video && `videos/${ex.video}.mp4`,
    ]).filter(f => f && !fs.existsSync(path.join(dir, '..', f)));
    expect(missing).toEqual([]);
  });

  it('o índice lista todos e cada página aponta pra vizinhos do mesmo grupo', () => {
    const index = new DOMParser().parseFromString(renderIndex(all, shell), 'text/html');
    expect(index.querySelectorAll('.lib-group .ex-card').length).toBe(all.length);
    const ex = all.find(e => e.video);
    const doc = new DOMParser().parseFromString(renderDetail(ex, all, shell), 'text/html');
    expect(doc.querySelector('h1').textContent).toBe(ex.nome);
    expect(doc.querySelector('#demoVideo source').getAttribute('src')).toBe(`/app/videos/${ex.video}.mp4`);
    const related = [...doc.querySelectorAll('.ex-related .ex-card')].map(a => a.getAttribute('href'));
    expect(related.length).toBeGreaterThan(0);
    expect(related).not.toContain(`/exercicios/${ex.slug}/`);
  });

  it('todo texto das páginas geradas tem inglês', () => {
    const win = {};
    new Function('window', read('i18n-en.js'))(win);
    const own = buildDictionary(all);
    const text = { ...win.LANDING_EN.text, ...own.text };
    const attrs = { ...win.LANDING_EN.attrs, ...own.attrs };
    const same = new Set([...own.same, 'EAFIT', 'EN', 'App', 'wger.de', 'Free Exercise DB', 'contato.eafit@gmail.com']);
    const norm = s => s.replace(/\s+/g, ' ').trim();
    const noLetters = t => !/[A-Za-zÀ-ú]{2}/.test(t);
    const missing = new Set();
    for (const html of [renderIndex(all, shell), ...all.map(ex => renderDetail(ex, all, shell))]) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        if (['SCRIPT', 'STYLE'].includes(n.parentNode.nodeName)) continue;
        const t = norm(n.nodeValue);
        if (t && !noLetters(t) && !(t in text) && !same.has(t)) missing.add(t);
      }
      if (!(norm(doc.title) in text)) missing.add(doc.title);
      doc.body.querySelectorAll('[alt],[aria-label],[placeholder]').forEach(el => {
        for (const a of ['alt', 'aria-label', 'placeholder']) {
          const v = el.getAttribute(a);
          if (v && !noLetters(v) && !(v in attrs) && !/Language:/.test(v)) missing.add(v);
        }
      });
    }
    expect([...missing]).toEqual([]);
  });

  it('o sitemap traz as páginas escritas à mão e as geradas', () => {
    const xml = buildSitemap(all);
    for (const p of handPages.slice(1)) expect(xml).toContain(`https://eafit.com.br/${p.replace('index.html', '')}</loc>`);
    expect(xml).toContain('https://eafit.com.br/exercicios/supino-reto-com-barra/</loc>');
    expect(xml.match(/<url>/g).length).toBe(all.length + handPages.length + 4);
  });
});
