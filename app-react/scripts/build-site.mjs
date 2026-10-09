// Gera a parte do site que sai de dados, dentro de public/landing/ (o deploy
// sobe essa pasta pra raiz do domínio):
//   - exercicios/index.html e exercicios/<slug>/index.html: biblioteca pública
//   - exercicios/i18n-en.js: inglês dessas páginas (soma ao landing/i18n-en.js)
//   - sitemap.xml: páginas escritas à mão + as geradas
// Roda antes do `vite build` (npm run build) ou avulso com `npm run site`.
// A saída não é versionada (ver .gitignore).
//
// Fontes: a biblioteca semeada em supabase/migrations/*exercise_library*.sql
// (nome, grupo, séries, técnica...), as demonstrações de
// src/data/exerciseMedia.js e exerciseVideos.js e o inglês de
// src/i18n/en/exercises.js. Só entra exercício da biblioteca que tem
// demonstração. Cabeçalho, rodapé e <head> comuns são copiados da home
// (blocos site-head, site-header e site-footer de public/landing/index.html).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EXERCISE_VIDEOS, videoCredit } from '../src/data/exerciseVideos.js';
import { names as EN_NAMES, techniques as EN_TECHNIQUES, repsRules } from '../src/i18n/en/exercises.js';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(APP, '..');
const LANDING = path.join(APP, 'public/landing');
const SITE = 'https://eafit.com.br';

// Ordem de exibição; `id` é o grupo_muscular da biblioteca e a âncora em /exercicios/#id.
export const GROUPS = [
  { id: 'peito', label: 'Peito', en: 'Chest' },
  { id: 'costas', label: 'Costas', en: 'Back' },
  { id: 'ombro', label: 'Ombros', en: 'Shoulders' },
  { id: 'biceps', label: 'Bíceps', en: 'Biceps' },
  { id: 'triceps', label: 'Tríceps', en: 'Triceps' },
  { id: 'quadriceps', label: 'Quadríceps', en: 'Quads' },
  { id: 'posterior_coxa', label: 'Posterior de coxa', en: 'Hamstrings' },
  { id: 'gluteos', label: 'Glúteos', en: 'Glutes' },
  { id: 'panturrilha', label: 'Panturrilha', en: 'Calves' },
  { id: 'core', label: 'Abdômen e core', en: 'Abs and core' },
  { id: 'cardio', label: 'Cardio', en: 'Cardio' },
];
const TIPOS = {
  composto: ['Composto', 'Compound'],
  isolado: ['Isolado', 'Isolation'],
  cardio: ['Cardio', 'Cardio'],
};
const EQUIPAMENTOS = {
  barra: ['Barra', 'Barbell'],
  halteres: ['Halteres', 'Dumbbells'],
  'máquina': ['Máquina', 'Machine'],
  'peso corporal': ['Peso corporal', 'Bodyweight'],
  polia: ['Polia', 'Cable'],
  'elástico': ['Elástico', 'Resistance band'],
  kettlebell: ['Kettlebell', 'Kettlebell'],
  caneleira: ['Caneleira', 'Ankle weights'],
  bola: ['Bola', 'Exercise ball'],
  piscina: ['Piscina', 'Pool'],
};
const NIVEIS = {
  iniciante: ['Nível iniciante', 'Beginner level'],
  intermediario: ['Nível intermediário', 'Intermediate level'],
  avancado: ['Nível avançado', 'Advanced level'],
};
const FRAMES_CREDIT = 'Imagens: Free Exercise DB · domínio público';

// Texto fixo das páginas geradas → inglês. O teste scripts/build-site.test.js
// falha se algum texto visível dessas páginas ficar sem entrada.
const UI_EN = {
  'Biblioteca de exercícios do EAFIT — demonstração, séries e técnica': 'EAFIT exercise library — demos, sets and form tips',
  'Biblioteca': 'Library',
  'Biblioteca de exercícios': 'Exercise library',
  'exercícios com demonstração de execução, séries e repetições sugeridas e dica de técnica. São os mesmos que o app usa pra montar o seu treino.':
    'exercises with a demo, suggested sets and reps and a form tip. They are the same ones the app uses to build your workout.',
  'Buscar exercício': 'Search exercises',
  'Nenhum exercício com esse nome.': 'No exercise with that name.',
  'Exercícios': 'Exercises',
  'Como treinar': 'How to train it',
  'Séries': 'Sets',
  'Repetições': 'Reps',
  'Tempo': 'Time',
  'Duração': 'Duration',
  'Descanso': 'Rest',
  'Dica de técnica': 'Form tip',
  'Sugestão de séries e repetições da biblioteca do EAFIT. No app, o plano é montado pelo seu objetivo e nível.':
    'Suggested sets and reps from the EAFIT library. In the app, the plan is built for your goal and level.',
  '⏸ Pausar': '⏸ Pause',
  '▶ Reproduzir': '▶ Play',
  '🐢 Câmera lenta': '🐢 Slow motion',
  'Mais exercícios do mesmo grupo': 'More exercises for the same muscle group',
  'Leve esse exercício pro seu treino': 'Take this exercise to your workout',
  'Monte seu treino com esses exercícios': 'Build your workout with these exercises',
  'No EAFIT você registra carga e repetições, vê a demonstração na hora e acompanha a evolução. Grátis e sem anúncios.':
    'In EAFIT you log weight and reps, watch the demo on the spot and track your progress. Free and ad-free.',
  'Começar grátis': 'Start free',
  [FRAMES_CREDIT]: 'Images: Free Exercise DB · public domain',
};
const UI_ATTRS_EN = {
  'Trilha de navegação': 'Breadcrumb',
  'Buscar exercício pelo nome': 'Search exercises by name',
  'Grupos musculares': 'Muscle groups',
  'Vídeo de demonstração do exercício': 'Exercise demo video',
  'Dois quadros do movimento, alternando': 'Two frames of the movement, alternating',
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const slugify = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const toEnReps = s => repsRules.reduce((acc, [re, to]) => acc.replace(re, to), s);
const titleOf = nome => `${nome}: como fazer, séries e técnica | EAFIT`;

// ---------- dados ----------

// Linhas do seed: ('Nome', 'grupo', 'tipo', equip|null, 'series', 'reps',
// 'descanso', 'tecnica', is_post_workout[, 'nivel_minimo']) — mesmo formato
// lido por src/data/exerciseI18n.test.js.
function readLibrary() {
  const dir = path.join(REPO, 'supabase/migrations');
  const sq = "'((?:[^']|'')*)'";
  const unq = s => s.replace(/''/g, "'");
  const rowRe = new RegExp(`^\\(${sq},\\s*'([a-z_]+)',\\s*'(composto|isolado|cardio)',\\s*(?:${sq}|null),\\s*${sq},\\s*${sq},\\s*${sq},\\s*${sq},\\s*(?:true|false)(?:,\\s*'([a-z]+)')?\\)`, 'gm');
  const levelRe = /update public\.exercise_library set nivel_minimo = '([a-z]+)' where nome in \(([^;]*)\);/g;
  const rows = new Map();
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.includes('exercise_library')) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const m of sql.matchAll(rowRe)) {
      const nome = unq(m[1]);
      if (rows.has(nome)) continue; // on conflict (nome) do nothing
      rows.set(nome, {
        nome, grupo: m[2], tipo: m[3], equipamento: m[4] ? unq(m[4]) : null,
        series: m[5], reps: unq(m[6]), descanso: m[7], tecnica: unq(m[8]), nivel: m[9] || 'iniciante',
      });
    }
    for (const m of sql.matchAll(levelRe)) {
      for (const n of m[2].matchAll(new RegExp(sq, 'g'))) {
        const row = rows.get(unq(n[1]));
        if (row) row.nivel = m[1];
      }
    }
  }
  return [...rows.values()];
}

// exerciseMedia.js importa sem extensão (o Vite resolve, o Node não), então o
// mapa nome → pasta de imagens é lido do texto, como no teste de tradução.
function readFrames() {
  const src = fs.readFileSync(path.join(APP, 'src/data/exerciseMedia.js'), 'utf8');
  const body = src.slice(src.indexOf('export const EXERCISE_MEDIA = {'), src.indexOf('\n};'));
  return new Map([...body.matchAll(/^\s*'([^']+)'\s*:\s*'([^']+)'/gm)].map(m => [m[1], m[2]]));
}

export function loadExercises() {
  const frames = readFrames();
  const slugs = new Set();
  return readLibrary()
    .map(row => ({ ...row, frames: frames.get(row.nome) || null, video: EXERCISE_VIDEOS[row.nome] || null }))
    .filter(ex => ex.frames || ex.video)
    .map(ex => {
      const slug = slugify(ex.nome);
      if (!slug || slugs.has(slug)) throw new Error(`slug vazio ou repetido: ${ex.nome}`);
      if (!GROUPS.some(g => g.id === ex.grupo)) throw new Error(`grupo sem rótulo em GROUPS: ${ex.grupo} (${ex.nome})`);
      if (ex.equipamento && !EQUIPAMENTOS[ex.equipamento]) throw new Error(`equipamento sem rótulo: ${ex.equipamento} (${ex.nome})`);
      slugs.add(slug);
      return { ...ex, slug };
    });
}

// ---------- casca comum (copiada da home) ----------

export function loadShell() {
  const home = fs.readFileSync(path.join(LANDING, 'index.html'), 'utf8');
  const block = name => {
    const m = home.match(new RegExp(`[ \\t]*<!-- ${name}[^>]*-->[\\s\\S]*?<!-- /${name} -->`));
    if (!m) throw new Error(`bloco ${name} não encontrado em public/landing/index.html`);
    return m[0];
  };
  return { head: block('site-head'), header: block('site-header'), footer: block('site-footer') };
}

function page(shell, { title, desc, url, extraHead = '', main }) {
  return `<!doctype html>
<!-- Gerado por scripts/build-site.mjs. Não edite: mude o script e rode \`npm run site\`. -->
<html lang="pt-br">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <link rel="canonical" href="${SITE}${url}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:url" content="${SITE}${url}" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(desc)}" />

${shell.head}
  <script src="/exercicios/i18n-en.js" defer></script>
${extraHead}</head>
<body>
${shell.header}

  <main id="top" tabindex="-1">
${main}
  </main>

${shell.footer}
</body>
</html>
`;
}

// ---------- pedaços ----------

const PLAY_ICON = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>';
const frameUrl = (ex, n) => `/app/exercicios/${ex.frames}/${n}.webp`;

function card(ex) {
  const thumb = ex.frames
    ? `<img src="${frameUrl(ex, 0)}" alt="" width="400" height="300" loading="lazy" />`
    : PLAY_ICON;
  const equip = ex.equipamento ? ` · <span>${EQUIPAMENTOS[ex.equipamento][0]}</span>` : '';
  return `          <li><a class="ex-card" href="/exercicios/${ex.slug}/"><span class="ex-card__img">${thumb}</span><span class="ex-card__body"><b>${esc(ex.nome)}</b><span><span>${TIPOS[ex.tipo][0]}</span>${equip}</span></span></a></li>`;
}

function ctaBand(title) {
  return `    <section class="lib-end" data-section="exercicio">
      <div class="wrap">
        <div class="cta-band reveal">
          <h2>${title}</h2>
          <p>No EAFIT você registra carga e repetições, vê a demonstração na hora e acompanha a evolução. Grátis e sem anúncios.</p>
          <a class="btn btn-primary" href="/app/">Começar grátis</a>
        </div>
      </div>
    </section>`;
}

function media(ex) {
  if (ex.video) {
    const poster = ex.frames ? ` poster="${frameUrl(ex, 0)}"` : '';
    return `          <div class="panel">
            <div class="demo-video">
              <video id="demoVideo" muted loop playsinline preload="none"${poster} aria-label="Vídeo de demonstração do exercício">
                <source src="/app/videos/${ex.video}.mp4" type="video/mp4" />
              </video>
              <span class="speed" id="demoSpeed" hidden>0,5×</span>
            </div>
            <div class="demo-controls">
              <button type="button" id="demoPlay" aria-pressed="false">⏸ Pausar</button>
              <button type="button" id="demoSlow" aria-pressed="false">🐢 Câmera lenta</button>
            </div>
            <p class="credit">${esc(videoCredit(ex.video))}</p>
          </div>`;
  }
  return `          <div class="panel">
            <div class="demo-frames" role="img" aria-label="Dois quadros do movimento, alternando">
              <img src="${frameUrl(ex, 0)}" alt="" width="400" height="300" />
              <img src="${frameUrl(ex, 1)}" alt="" width="400" height="300" />
            </div>
            <p class="credit">${FRAMES_CREDIT}</p>
          </div>`;
}

function facts(ex) {
  const timed = ex.series === '-' || /^\d+(s|min)\b/.test(ex.reps);
  const items = [];
  if (ex.series !== '-') items.push(['Séries', ex.series]);
  items.push([ex.series === '-' ? 'Duração' : timed ? 'Tempo' : 'Repetições', ex.reps]);
  if (ex.descanso !== '-') items.push(['Descanso', ex.descanso]);
  return items.map(([k, v]) => `              <div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('\n');
}

// ---------- páginas ----------

export function renderDetail(ex, all, shell) {
  const group = GROUPS.find(g => g.id === ex.grupo);
  const same = all.filter(o => o.grupo === ex.grupo);
  const at = same.indexOf(ex);
  // Os próximos do grupo, dando a volta, pra cada página apontar pra vizinhos diferentes.
  const related = same.slice(at + 1).concat(same.slice(0, at)).slice(0, 6);
  const url = `/exercicios/${ex.slug}/`;
  const chips = [group.label, TIPOS[ex.tipo][0], ex.equipamento && EQUIPAMENTOS[ex.equipamento][0], NIVEIS[ex.nivel][0]]
    .filter(Boolean).map(t => `<li><span class="chip">${t}</span></li>`).join('');
  const crumbsLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Exercícios', item: `${SITE}/exercicios/` },
      { '@type': 'ListItem', position: 2, name: group.label, item: `${SITE}/exercicios/#${group.id}` },
      { '@type': 'ListItem', position: 3, name: ex.nome, item: SITE + url },
    ],
  };
  const tip = ex.tecnica ? `\n            <p class="ex-tip"><b>Dica de técnica</b>${esc(ex.tecnica)}</p>` : '';
  const main = `    <section class="ex-detail">
      <div class="wrap">
        <nav aria-label="Trilha de navegação">
          <ol class="crumbs">
            <li><a href="/exercicios/">Exercícios</a></li>
            <li><a href="/exercicios/#${group.id}">${group.label}</a></li>
          </ol>
        </nav>
        <h1>${esc(ex.nome)}</h1>
        <ul class="chip-row">${chips}</ul>
        <div class="ex-layout">
          <div class="ex-media">
${media(ex)}
          </div>
          <div class="ex-info">
            <h2>Como treinar</h2>
            <dl class="ex-facts">
${facts(ex)}
            </dl>${tip}
            <a class="btn btn-primary" href="/app/">Começar grátis</a>
            <p class="ex-note">Sugestão de séries e repetições da biblioteca do EAFIT. No app, o plano é montado pelo seu objetivo e nível.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="ex-related">
      <div class="wrap">
        <h2>Mais exercícios do mesmo grupo</h2>
        <ul class="ex-grid">
${related.map(card).join('\n')}
        </ul>
      </div>
    </section>

${ctaBand('Leve esse exercício pro seu treino')}`;
  return page(shell, {
    title: titleOf(ex.nome),
    desc: `Como fazer ${ex.nome}: demonstração de execução, séries e repetições sugeridas e dica de técnica.${ex.tecnica ? ` ${ex.tecnica}.` : ''}`,
    url,
    extraHead: `  <script type="application/ld+json">${JSON.stringify(crumbsLd)}</script>\n`,
    main,
  });
}

export function renderIndex(all, shell) {
  const groups = GROUPS.map(g => ({ ...g, items: all.filter(ex => ex.grupo === g.id) })).filter(g => g.items.length);
  const main = `    <section class="page-hero">
      <div class="wrap">
        <span class="eyebrow">Biblioteca</span>
        <h1>Biblioteca de exercícios</h1>
        <p class="lead"><b>${all.length}</b> exercícios com demonstração de execução, séries e repetições sugeridas e dica de técnica. São os mesmos que o app usa pra montar o seu treino.</p>
        <div class="lib-tools">
          <label class="sr-only" for="lib-search">Buscar exercício</label>
          <input class="lib-search" id="lib-search" type="search" placeholder="Buscar exercício pelo nome" autocomplete="off" />
          <ul class="chip-row" aria-label="Grupos musculares">
${groups.map(g => `            <li><a class="chip" href="#${g.id}">${g.label} <small>${g.items.length}</small></a></li>`).join('\n')}
          </ul>
        </div>
      </div>
    </section>

${groups.map(g => `    <section class="lib-group" id="${g.id}">
      <div class="wrap">
        <h2>${g.label} <small>${g.items.length}</small></h2>
        <ul class="ex-grid">
${g.items.map(card).join('\n')}
        </ul>
      </div>
    </section>`).join('\n\n')}

    <p class="lib-empty" id="lib-empty" hidden>Nenhum exercício com esse nome.</p>

${ctaBand('Monte seu treino com esses exercícios')}`;
  return page(shell, {
    title: 'Biblioteca de exercícios do EAFIT — demonstração, séries e técnica',
    desc: `${all.length} exercícios de musculação e cardio com demonstração de execução, séries e repetições sugeridas e dica de técnica, organizados por grupo muscular.`,
    url: '/exercicios/',
    main,
  });
}

// Inglês das páginas geradas, somado ao dicionário da landing (mesma regra:
// a chave é o texto do nó em português).
export function buildDictionary(all) {
  const text = { ...UI_EN };
  // `same`: textos que ficam iguais em inglês de propósito (Burpee, Cardio, 8-10...).
  const same = new Set();
  const put = (pt, en) => { if (pt && en && pt !== en) text[pt] = en; else if (pt && en) same.add(pt); };
  for (const g of GROUPS) put(g.label, g.en);
  for (const [pt, en] of [...Object.values(TIPOS), ...Object.values(EQUIPAMENTOS), ...Object.values(NIVEIS)]) put(pt, en);
  for (const slug of new Set(all.map(ex => ex.video).filter(Boolean))) {
    put(videoCredit(slug), videoCredit(slug).replace('Vídeo:', 'Video:'));
  }
  for (const ex of all) {
    const en = EN_NAMES[ex.nome];
    put(ex.nome, en);
    put(titleOf(ex.nome), en && `${en}: how to do it, sets and form tips | EAFIT`);
    put(ex.tecnica, EN_TECHNIQUES[ex.tecnica]);
    put(ex.reps, toEnReps(ex.reps));
    put(ex.descanso, toEnReps(ex.descanso));
  }
  return { text, attrs: { ...UI_ATTRS_EN }, same };
}

function dictionaryFile(dict) {
  return `/* Gerado por scripts/build-site.mjs: inglês da biblioteca de exercícios. */
(function () {
  var d = window.LANDING_EN;
  if (!d) return;
  Object.assign(d.text, ${JSON.stringify(dict.text, null, 1)});
  Object.assign(d.attrs, ${JSON.stringify(dict.attrs, null, 1)});
})();
`;
}

// Páginas escritas à mão: toda pasta de public/landing com index.html.
function handPages() {
  return fs.readdirSync(LANDING, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== 'exercicios' && fs.existsSync(path.join(LANDING, d.name, 'index.html')))
    .map(d => `/${d.name}/`).sort();
}

export function buildSitemap(all, pages = handPages()) {
  const urls = [
    ['/', '1.0'],
    ...pages.map(p => [p, '0.8']),
    ['/exercicios/', '0.8'],
    ['/app/', '0.6'],
    ...all.map(ex => [`/exercicios/${ex.slug}/`, '0.5']),
    ['/app/legal/termos.html', '0.2'],
    ['/app/legal/privacidade.html', '0.2'],
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Gerado por app-react/scripts/build-site.mjs; publicado na raiz do domínio pelo deploy.yml. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([loc, priority]) => `  <url><loc>${SITE}${loc}</loc><priority>${priority}</priority></url>`).join('\n')}
</urlset>
`;
}

export function build() {
  const all = loadExercises();
  const shell = loadShell();
  const out = path.join(LANDING, 'exercicios');
  fs.rmSync(out, { recursive: true, force: true });
  const write = (rel, content) => {
    const file = path.join(LANDING, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  write('exercicios/index.html', renderIndex(all, shell));
  for (const ex of all) write(`exercicios/${ex.slug}/index.html`, renderDetail(ex, all, shell));
  write('exercicios/i18n-en.js', dictionaryFile(buildDictionary(all)));
  write('sitemap.xml', buildSitemap(all));
  return all.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(`site: ${build()} páginas de exercício + índice + sitemap em public/landing/`);
}
