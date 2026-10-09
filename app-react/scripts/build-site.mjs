// Gera a parte do site que sai de dados, dentro de public/landing/ (o deploy
// sobe essa pasta pra raiz do domínio):
//   - exercicios/index.html: a biblioteca de exercícios em números (quantos,
//     pra quais grupos musculares, com que equipamento, tipo e nível). De
//     propósito não lista nomes nem demonstrações — isso fica dentro do app.
//   - exercicios/i18n-en.js: inglês dessa página (soma ao landing/i18n-en.js)
//   - sitemap.xml: páginas escritas à mão + a gerada
// Roda antes do `vite build` (npm run build) ou avulso com `npm run site`.
// Depois do `vite build`, `--stamp` carimba a versão dos CSS/JS em dist/landing.
// A saída não é versionada (ver .gitignore).
//
// Fontes: a biblioteca semeada em supabase/migrations/*exercise_library*.sql
// e as demonstrações de src/data/exerciseMedia.js e exerciseVideos.js.
// Cabeçalho, rodapé e <head> comuns são copiados da home (blocos site-head,
// site-header e site-footer de public/landing/index.html).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EXERCISE_VIDEOS } from '../src/data/exerciseVideos.js';

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
  { id: 'antebraco', label: 'Antebraço', en: 'Forearms' },
  { id: 'quadriceps', label: 'Quadríceps', en: 'Quads' },
  { id: 'posterior_coxa', label: 'Posterior de coxa', en: 'Hamstrings' },
  { id: 'gluteos', label: 'Glúteos', en: 'Glutes' },
  { id: 'panturrilha', label: 'Panturrilha', en: 'Calves' },
  { id: 'core', label: 'Abdômen e core', en: 'Abs and core' },
  { id: 'cardio', label: 'Cardio', en: 'Cardio' },
  { id: 'mobilidade', label: 'Mobilidade e alongamento', en: 'Mobility and stretching' },
];
// [rótulo da linha, inglês, rótulo depois do número no card do grupo, inglês]
const TIPOS = {
  composto: ['Compostos', 'Compound', 'compostos', 'compound'],
  isolado: ['Isolados', 'Isolation', 'isolados', 'isolation'],
  cardio: ['Cardio', 'Cardio', 'de cardio', 'cardio'],
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
  anilha: ['Anilha', 'Weight plate'],
  'fita de suspensão': ['Fita de suspensão', 'Suspension trainer'],
  'medicine ball': ['Medicine ball', 'Medicine ball'],
  'trenó': ['Trenó', 'Sled'],
  rolo: ['Rolo de liberação', 'Foam roller'],
};
const SEM_EQUIPAMENTO = ['Sem equipamento', 'No equipment'];
const NIVEIS = {
  iniciante: ['Iniciante', 'Beginner'],
  intermediario: ['Intermediário', 'Intermediate'],
  avancado: ['Avançado', 'Advanced'],
};

// Texto fixo da página gerada → inglês. O teste scripts/build-site.test.js
// falha se algum texto visível ficar sem entrada.
const UI_EN = {
  'Biblioteca de exercícios do EAFIT em números': 'The EAFIT exercise library in numbers',
  'Biblioteca': 'Library',
  'Biblioteca de exercícios': 'Exercise library',
  'O que tem dentro do app, em números: quantos exercícios, pra quais músculos e com que equipamento. Os nomes, as demonstrações e as dicas de técnica você vê no app.':
    'What is inside the app, in numbers: how many exercises, for which muscles and with what equipment. The names, the demos and the form tips are in the app.',
  'exercícios': 'exercises',
  'grupos musculares': 'muscle groups',
  'tipos de equipamento': 'kinds of equipment',
  'com demonstração': 'with a demo',
  'com vídeo': 'with video',
  'Por grupo muscular': 'By muscle group',
  'Do peito à panturrilha, com opções pra montar um treino completo.': 'From chest to calves, with options to build a complete workout.',
  'Por equipamento': 'By equipment',
  'Pra academia completa, pra quem só tem halteres ou pra treinar com o peso do corpo.':
    'For a full gym, for those with only dumbbells or for bodyweight training.',
  'Por tipo': 'By type',
  'Por nível': 'By level',
  'Nível a partir do qual o exercício entra no plano.': 'The level from which the exercise can be part of the plan.',
  'Compostos trabalham vários músculos de uma vez; isolados focam em um.': 'Compound moves work several muscles at once; isolation moves focus on one.',
  'Monte seu treino com esses exercícios': 'Build your workout with these exercises',
  'O EAFIT escolhe os exercícios pelo seu objetivo e nível, mostra a execução de cada um e registra a sua evolução. Grátis e sem anúncios.':
    'EAFIT picks the exercises for your goal and level, shows how to do each one and tracks your progress. Free and ad-free.',
  'Começar grátis': 'Start free',
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
      rows.set(nome, { nome, grupo: m[2], tipo: m[3], equipamento: m[4] ? unq(m[4]) : null, nivel: m[9] || 'iniciante' });
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

// exerciseMedia.js importa sem extensão (o Vite resolve, o Node não), então os
// nomes com imagens são lidos do texto, como no teste de tradução.
function readFrames() {
  const src = fs.readFileSync(path.join(APP, 'src/data/exerciseMedia.js'), 'utf8');
  const body = src.slice(src.indexOf('export const EXERCISE_MEDIA = {'), src.indexOf('\n};'));
  return new Set([...body.matchAll(/^\s*'([^']+)'\s*:\s*'/gm)].map(m => m[1]));
}

export function loadExercises() {
  const frames = readFrames();
  return readLibrary().map(row => {
    if (!GROUPS.some(g => g.id === row.grupo)) throw new Error(`grupo sem rótulo em GROUPS: ${row.grupo} (${row.nome})`);
    if (row.equipamento && !EQUIPAMENTOS[row.equipamento]) throw new Error(`equipamento sem rótulo: ${row.equipamento} (${row.nome})`);
    const video = Boolean(EXERCISE_VIDEOS[row.nome]);
    return { ...row, video, demo: video || frames.has(row.nome) };
  });
}

// Só contagens: é tudo o que a página pública mostra.
export function summarize(all) {
  const count = (list, key) => list.reduce((acc, ex) => { acc[ex[key] ?? ''] = (acc[ex[key] ?? ''] || 0) + 1; return acc; }, {});
  const byTipo = count(all, 'tipo');
  const byEquip = count(all, 'equipamento');
  const byNivel = count(all, 'nivel');
  return {
    total: all.length,
    demos: all.filter(ex => ex.demo).length,
    videos: all.filter(ex => ex.video).length,
    groups: GROUPS.map(g => {
      const items = all.filter(ex => ex.grupo === g.id);
      return { ...g, total: items.length, tipos: count(items, 'tipo') };
    }).filter(g => g.total),
    tipos: Object.keys(TIPOS).filter(k => byTipo[k]).map(k => ({ label: TIPOS[k][0], total: byTipo[k] })),
    equipamentos: Object.entries(byEquip)
      .map(([k, total]) => ({ label: (EQUIPAMENTOS[k] || SEM_EQUIPAMENTO)[0], total }))
      .sort((a, b) => b.total - a.total),
    niveis: Object.keys(NIVEIS).filter(k => byNivel[k]).map(k => ({ label: NIVEIS[k][0], total: byNivel[k] })),
  };
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

// ---------- página ----------

function bars(rows) {
  const max = Math.max(...rows.map(r => r.total));
  return `<ul class="bar-list">
${rows.map(r => `            <li><span>${r.label}</span><span class="bar"><i style="width:${Math.round((r.total / max) * 100)}%"></i></span><b>${r.total}</b></li>`).join('\n')}
          </ul>`;
}

export function renderIndex(all, shell) {
  const s = summarize(all);
  const max = Math.max(...s.groups.map(g => g.total));
  const tile = (n, label) => `          <div class="stat"><b>${n}</b><span>${label}</span></div>`;
  const title = 'Biblioteca de exercícios do EAFIT em números';
  const desc = `${s.total} exercícios de musculação e cardio em ${s.groups.length} grupos musculares, ${s.demos} deles com demonstração de execução. Veja como a biblioteca do EAFIT se divide por grupo, equipamento, tipo e nível.`;
  return `<!doctype html>
<!-- Gerado por scripts/build-site.mjs. Não edite: mude o script e rode \`npm run site\`. -->
<html lang="pt-br">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <link rel="canonical" href="${SITE}/exercicios/" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:url" content="${SITE}/exercicios/" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(desc)}" />

${shell.head}
  <script src="/exercicios/i18n-en.js" defer></script>
</head>
<body>
${shell.header}

  <main id="top" tabindex="-1">
    <section class="page-hero">
      <div class="wrap">
        <span class="eyebrow">Biblioteca</span>
        <h1>Biblioteca de exercícios</h1>
        <p class="lead">O que tem dentro do app, em números: quantos exercícios, pra quais músculos e com que equipamento. Os nomes, as demonstrações e as dicas de técnica você vê no app.</p>
        <div class="stats-grid">
${[tile(s.total, 'exercícios'), tile(s.groups.length, 'grupos musculares'), tile(s.equipamentos.length, 'tipos de equipamento'), tile(s.demos, 'com demonstração'), tile(s.videos, 'com vídeo')].join('\n')}
        </div>
      </div>
    </section>

    <section class="lib-section">
      <div class="wrap">
        <div class="section-head reveal">
          <h2>Por grupo muscular</h2>
          <p>Do peito à panturrilha, com opções pra montar um treino completo.</p>
        </div>
        <ul class="group-grid">
${s.groups.map(g => `          <li class="group-card reveal" id="${g.id}"><span class="group-card__name">${g.label}</span><b>${g.total}</b><span class="bar"><i style="width:${Math.round((g.total / max) * 100)}%"></i></span><span class="group-card__mix">${Object.keys(TIPOS).filter(k => g.tipos[k]).map(k => `<span><b>${g.tipos[k]}</b> ${TIPOS[k][2]}</span>`).join('')}</span></li>`).join('\n')}
        </ul>
      </div>
    </section>

    <section class="lib-section band">
      <div class="wrap">
        <div class="section-head reveal">
          <h2>Por equipamento</h2>
          <p>Pra academia completa, pra quem só tem halteres ou pra treinar com o peso do corpo.</p>
        </div>
        <div class="bar-panel reveal">
          ${bars(s.equipamentos)}
        </div>
      </div>
    </section>

    <section class="lib-section">
      <div class="wrap bar-cols">
        <div class="bar-panel reveal">
          <h2>Por tipo</h2>
          <p>Compostos trabalham vários músculos de uma vez; isolados focam em um.</p>
          ${bars(s.tipos)}
        </div>
        <div class="bar-panel reveal reveal-d1">
          <h2>Por nível</h2>
          <p>Nível a partir do qual o exercício entra no plano.</p>
          ${bars(s.niveis)}
        </div>
      </div>
    </section>

    <section class="lib-section" data-section="exercicio">
      <div class="wrap">
        <div class="cta-band reveal">
          <h2>Monte seu treino com esses exercícios</h2>
          <p>O EAFIT escolhe os exercícios pelo seu objetivo e nível, mostra a execução de cada um e registra a sua evolução. Grátis e sem anúncios.</p>
          <a class="btn btn-primary" href="/app/">Começar grátis</a>
        </div>
      </div>
    </section>
  </main>

${shell.footer}
</body>
</html>
`;
}

// Inglês da página gerada, somado ao dicionário da landing (mesma regra: a
// chave é o texto do nó em português). `same`: rótulos iguais nos dois idiomas.
export function buildDictionary() {
  const text = { ...UI_EN };
  const same = new Set();
  const put = (pt, en) => { if (pt !== en) text[pt] = en; else same.add(pt); };
  for (const g of GROUPS) put(g.label, g.en);
  for (const t of Object.values(TIPOS)) { put(t[0], t[1]); put(t[2], t[3]); }
  for (const [pt, en] of [...Object.values(EQUIPAMENTOS), SEM_EQUIPAMENTO, ...Object.values(NIVEIS)]) put(pt, en);
  return { text, same };
}

function dictionaryFile(dict) {
  return `/* Gerado por scripts/build-site.mjs: inglês da biblioteca de exercícios. */
(function () {
  var d = window.LANDING_EN;
  if (d) Object.assign(d.text, ${JSON.stringify(dict.text, null, 1)});
})();
`;
}

// Páginas escritas à mão: toda pasta de public/landing com index.html.
function handPages() {
  return fs.readdirSync(LANDING, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== 'exercicios' && fs.existsSync(path.join(LANDING, d.name, 'index.html')))
    .map(d => `/${d.name}/`).sort();
}

export function buildSitemap(pages = handPages()) {
  const urls = [
    ['/', '1.0'],
    ...pages.map(p => [p, '0.8']),
    ['/exercicios/', '0.8'],
    ['/app/', '0.6'],
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
  const out = path.join(LANDING, 'exercicios');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'index.html'), renderIndex(all, loadShell()));
  fs.writeFileSync(path.join(out, 'i18n-en.js'), dictionaryFile(buildDictionary()));
  fs.writeFileSync(path.join(LANDING, 'sitemap.xml'), buildSitemap());
  return all.length;
}

// Depois do `vite build`: acrescenta ?v=<hash do conteúdo> aos CSS/JS do site
// em todo HTML de dist/landing. O GitHub Pages deixa o navegador guardar os
// arquivos por 10 minutos; sem isso, logo após um deploy o visitante podia
// receber o HTML novo com o site.css antigo (menu quebrado). Só mexe em dist.
const STAMPED = ['/assets/site.css', '/assets/site.js', '/i18n-en.js', '/exercicios/i18n-en.js'];

export function stampHtml(html, versions) {
  return STAMPED.reduce((acc, url) => (versions[url]
    ? acc.replaceAll(`"${url}"`, `"${url}?v=${versions[url]}"`)
    : acc), html);
}

export function stamp(distLanding) {
  const versions = {};
  for (const url of STAMPED) {
    const file = path.join(distLanding, url);
    if (fs.existsSync(file)) versions[url] = createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 10);
  }
  let count = 0;
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.html')) { fs.writeFileSync(full, stampHtml(fs.readFileSync(full, 'utf8'), versions)); count++; }
    }
  };
  walk(distLanding);
  return count;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--stamp') {
    console.log(`site: versão dos assets carimbada em ${stamp(path.join(APP, 'dist/landing'))} páginas de dist/landing/`);
  } else {
    console.log(`site: biblioteca em números (${build()} exercícios) + sitemap em public/landing/`);
  }
}
