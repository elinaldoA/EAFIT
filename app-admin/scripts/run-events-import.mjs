// Importa o calendário de provas do CorridasBR (https://www.corridasbr.com.br)
// para a tabela run_events, como RASCUNHO: nada aparece no app até o admin
// aprovar em Conteúdo > Provas de corrida.
//
//   node scripts/run-events-import.mjs ES MG --out provas.sql
//   node scripts/run-events-import.mjs ES --json provas.json --no-detail
//
// Passos por UF: lê o calendário, abre a página de cada prova (data completa,
// local da largada e o link do organizador), localiza a cidade (Open-Meteo
// geocoding, sem chave) e escreve um SQL de upsert por (source, source_id).
// Reimportar não mexe no status de quem já foi aprovada/descartada.
//
// Uso interno e com calma: 1 requisição por segundo, identificada. Os dados são
// do CorridasBR; o app sempre linka para o organizador e pede para confirmar.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://www.corridasbr.com.br';
const UA = 'EAFIT-calendario/1.0 (importacao interna de provas)';
const DELAY_MS = 1000;

const UF_NAMES = {
  AC: 'Acre', AL: 'Alagoas', AM: 'Amazonas', AP: 'Amapá', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MG: 'Minas Gerais', MS: 'Mato Grosso do Sul', MT: 'Mato Grosso',
  PA: 'Pará', PB: 'Paraíba', PE: 'Pernambuco', PI: 'Piauí', PR: 'Paraná', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RO: 'Rondônia', RR: 'Roraima', RS: 'Rio Grande do Sul', SC: 'Santa Catarina', SE: 'Sergipe', SP: 'São Paulo', TO: 'Tocantins',
};

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã', auml: 'ä', eacute: 'é', egrave: 'è', ecirc: 'ê',
  iacute: 'í', oacute: 'ó', ocirc: 'ô', otilde: 'õ', uacute: 'ú', uuml: 'ü', ccedil: 'ç',
  Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Eacute: 'É', Ecirc: 'Ê', Iacute: 'Í', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ', Uacute: 'Ú', Ccedil: 'Ç',
};

export function decodeEntities(text) {
  return String(text)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => NAMED[n] ?? m);
}

const clean = html => decodeEntities(String(html).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// "10/5/3km", "6,5km", "42 / 21 km" -> [10, 5, 3]. Texto sem número -> [].
export function parseDistances(text) {
  return [...new Set(String(text || '').replace(/km/gi, '').split(/[/;+]|\be\b/i)
    .map(p => Number(p.trim().replace(',', '.'))).filter(n => Number.isFinite(n) && n > 0 && n <= 250))];
}

// "20.11" -> "2026-11-20". Sem ano na página: se a data já passou há mais de
// um mês, é do ano que vem (calendário de fim de ano mostrando janeiro).
export function inferDate(dayMonth, today = new Date()) {
  const m = /^(\d{1,2})\.(\d{1,2})$/.exec(String(dayMonth).trim());
  if (!m) return null;
  const [day, month] = [Number(m[1]), Number(m[2])];
  let year = today.getFullYear();
  const candidate = new Date(year, month - 1, day);
  if (candidate.getMonth() !== month - 1) return null;
  if (today - candidate > 31 * 86400000) year += 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Linhas da tabela do calendário -> [{ id, dayMonth, city, name, distances }]
export function parseCalendar(html) {
  const out = [];
  for (const row of String(html).split(/<tr\b/i).slice(1)) {
    const link = /mostracorrida\.asp\?escolha=(\d+)[^'"]*['"][^>]*>([\s\S]*?)<\/a>/i.exec(row);
    if (!link) continue;
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(c => clean(c[1]));
    const dayMonth = cells.find(c => /^\d{1,2}\.\d{1,2}$/.test(c));
    if (!dayMonth) continue;
    const city = cells[cells.indexOf(dayMonth) + 1] || '';
    out.push({ id: link[1], dayMonth, city, name: clean(link[2]), distances: parseDistances(cells[cells.length - 1]) });
  }
  return out;
}

// Página da prova -> { date, venue, url }
export function parseDetail(html) {
  const text = decodeEntities(String(html).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<\/(td|tr|div|p)>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const after = label => {
    const i = text.findIndex(l => l.toLowerCase() === label.toLowerCase());
    return i >= 0 ? (text[i + 1] || '') : '';
  };
  const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(after('Data:'));
  const dest = /siteevento\.asp\?c=(https?:\/\/[^'"\s)]+)/i.exec(String(html));
  let url = null;
  if (dest) {
    try { url = decodeURIComponent(dest[1]); } catch { url = dest[1]; }
    if (!/^https?:\/\/\S+$/i.test(url) || /corridasbr\.com\.br/i.test(url)) url = null;
  }
  const venue = after('Largada:');
  return { date: d ? `${d[3]}-${d[2]}-${d[1]}` : null, venue: venue && !/^largada/i.test(venue) ? venue.slice(0, 120) : '', url };
}

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const sleep = ms => new Promise(r => setTimeout(r, ms));
const decoder = new TextDecoder('windows-1252');

async function getHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} em ${url}`);
  return decoder.decode(await res.arrayBuffer());
}

const geoCache = new Map();
async function geocode(city, uf) {
  const key = `${norm(city)}|${uf}`;
  if (geoCache.has(key)) return geoCache.get(key);
  let hit = null;
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=10&language=pt&countryCode=BR`, { headers: { 'User-Agent': UA } });
    const list = (await res.json()).results || [];
    const found = list.find(r => norm(r.admin1) === norm(UF_NAMES[uf]));
    if (found) hit = { lat: Math.round(found.latitude * 1e5) / 1e5, lng: Math.round(found.longitude * 1e5) / 1e5 };
  } catch { /* sem coordenadas: a prova só entra pelo filtro de estado */ }
  geoCache.set(key, hit);
  await sleep(250);
  return hit;
}

const q = v => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

export function toSql(rows) {
  if (!rows.length) return '-- nenhuma prova\n';
  const values = rows.map(r => `(${[
    q(r.name), q(r.event_date), q(r.city), q(r.state), q(r.venue), r.lat ?? 'null', r.lng ?? 'null',
    `'{${r.distances.join(',')}}'::numeric[]`, q(r.url), q(r.source), q(r.source_id), q(r.source_url),
  ].join(', ')})`).join(',\n');
  return `insert into public.run_events (name, event_date, city, state, venue, lat, lng, distances, url, source, source_id, source_url)
values
${values}
on conflict (source, source_id) where source_id is not null do update set
  name = excluded.name, event_date = excluded.event_date, city = excluded.city, state = excluded.state,
  venue = excluded.venue, lat = coalesce(excluded.lat, run_events.lat), lng = coalesce(excluded.lng, run_events.lng),
  distances = excluded.distances, url = coalesce(excluded.url, run_events.url), source_url = excluded.source_url;
`;
}

async function importState(uf, { detail }) {
  console.error(`[${uf}] lendo o calendário…`);
  const list = parseCalendar(await getHtml(`${BASE}/${uf}/Calendario.asp`));
  console.error(`[${uf}] ${list.length} provas`);
  const rows = [];
  for (const item of list) {
    const sourceUrl = `${BASE}/${uf}/mostracorrida.asp?escolha=${item.id}`;
    let info = { date: null, venue: '', url: null };
    if (detail) {
      await sleep(DELAY_MS);
      try { info = parseDetail(await getHtml(sourceUrl)); } catch (err) { console.error(`  ! ${item.id}: ${err.message}`); }
    }
    const date = info.date || inferDate(item.dayMonth);
    if (!date || !item.name) continue;
    const geo = item.city ? await geocode(item.city, uf) : null;
    rows.push({
      name: item.name.slice(0, 120), event_date: date, city: item.city.slice(0, 80) || null, state: uf, venue: info.venue || null,
      lat: geo?.lat ?? null, lng: geo?.lng ?? null, distances: item.distances, url: info.url,
      source: 'corridasbr', source_id: item.id, source_url: sourceUrl,
    });
  }
  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  const ufs = args.filter(a => /^[A-Za-z]{2}$/.test(a)).map(a => a.toUpperCase()).filter(uf => UF_NAMES[uf]);
  if (!ufs.length) {
    console.error('Uso: node scripts/run-events-import.mjs ES [MG ...] [--out provas.sql] [--json provas.json] [--no-detail]');
    process.exit(1);
  }
  const rows = [];
  for (const uf of ufs) rows.push(...await importState(uf, { detail: !args.includes('--no-detail') }));
  if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(rows, null, 2));
  writeFileSync(opt('--out') || 'run-events.sql', toSql(rows));
  console.error(`${rows.length} provas prontas (${rows.filter(r => r.lat != null).length} com coordenadas, ${rows.filter(r => r.url).length} com link do organizador).`);
}

const same = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();
if (process.argv[1] && same(fileURLToPath(import.meta.url), process.argv[1])) {
  main().catch(err => { console.error(err); process.exit(1); });
}
