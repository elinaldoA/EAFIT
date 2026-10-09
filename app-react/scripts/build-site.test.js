// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GROUPS, loadExercises, loadShell, summarize, renderIndex, buildDictionary, buildSitemap } from './build-site.mjs';

const dir = path.resolve(process.cwd(), 'public/landing');
const read = rel => fs.readFileSync(path.join(dir, rel), 'utf8');
const handPages = ['index.html', ...fs.readdirSync(dir, { withFileTypes: true })
  .filter(d => d.isDirectory() && d.name !== 'exercicios' && fs.existsSync(path.join(dir, d.name, 'index.html')))
  .map(d => `${d.name}/index.html`)];

const all = loadExercises();
const shell = loadShell();
const html = renderIndex(all, shell);
const doc = new DOMParser().parseFromString(html, 'text/html');

describe('casca do site', () => {
  // Cabeçalho, rodapé e <head> comuns são repetidos em cada página escrita à
  // mão (não há build): mudou num lugar, tem que mudar em todos.
  it('os blocos compartilhados são idênticos em todas as páginas', () => {
    for (const p of [...handPages, '404.html']) {
      const page = read(p);
      for (const [name, block] of Object.entries(shell)) {
        expect(page.includes(block), `${p}: bloco site-${name} diferente do da home`).toBe(true);
      }
    }
  });

  it('os links pra grupos da biblioteca apontam pra grupos que existem', () => {
    const ids = new Set(GROUPS.map(g => g.id));
    const links = handPages.flatMap(p => [...read(p).matchAll(/href="\/exercicios\/#([^"]+)"/g)].map(m => m[1]));
    expect(links.length).toBeGreaterThan(0);
    expect(links.filter(id => !ids.has(id))).toEqual([]);
    for (const id of links) expect(doc.getElementById(id)).toBeTruthy();
  });
});

describe('biblioteca de exercícios em números', () => {
  it('lê a biblioteca das migrations', () => {
    expect(all.length).toBeGreaterThan(200);
    const supino = all.find(ex => ex.nome === 'Supino Reto com Barra');
    // nivel_minimo vem do update da migration, não do insert
    expect(supino).toMatchObject({ grupo: 'peito', tipo: 'composto', nivel: 'intermediario', demo: true, video: true });
  });

  it('as contagens fecham com o total', () => {
    const s = summarize(all);
    const sum = rows => rows.reduce((n, r) => n + r.total, 0);
    expect(sum(s.groups)).toBe(s.total);
    expect(sum(s.tipos)).toBe(s.total);
    expect(sum(s.equipamentos)).toBe(s.total);
    expect(sum(s.niveis)).toBe(s.total);
    expect(s.videos).toBeLessThanOrEqual(s.demos);
    expect(s.demos).toBeLessThanOrEqual(s.total);
  });

  it('a página mostra os números e não revela nome de exercício', () => {
    const s = summarize(all);
    expect(doc.querySelector('.stat b').textContent).toBe(String(s.total));
    expect(doc.querySelectorAll('.group-card').length).toBe(s.groups.length);
    const leaked = all.filter(ex => html.includes(ex.nome)).map(ex => ex.nome);
    expect(leaked).toEqual([]);
  });

  it('todo texto da página gerada tem inglês', () => {
    const win = {};
    new Function('window', read('i18n-en.js'))(win);
    const own = buildDictionary();
    const text = { ...win.LANDING_EN.text, ...own.text };
    const same = new Set([...own.same, 'EAFIT', 'EN', 'App', 'wger.de', 'Free Exercise DB', 'contato.eafit@gmail.com']);
    const norm = t => t.replace(/\s+/g, ' ').trim();
    const noLetters = t => !/[A-Za-zÀ-ú]{2}/.test(t);
    const missing = new Set();
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (['SCRIPT', 'STYLE'].includes(n.parentNode.nodeName)) continue;
      const t = norm(n.nodeValue);
      if (t && !noLetters(t) && !(t in text) && !same.has(t)) missing.add(t);
    }
    if (!(norm(doc.title) in text)) missing.add(doc.title);
    expect([...missing]).toEqual([]);
  });

  it('o sitemap traz as páginas escritas à mão e a biblioteca, sem páginas por exercício', () => {
    const xml = buildSitemap();
    for (const p of handPages.slice(1)) expect(xml).toContain(`https://eafit.com.br/${p.replace('index.html', '')}</loc>`);
    expect(xml).toContain('https://eafit.com.br/exercicios/</loc>');
    expect(xml.match(/<url>/g).length).toBe(handPages.length + 4);
  });
});
