// Sincroniza o calendário de provas do CorridasBR (https://www.corridasbr.com.br)
// com a tabela run_events do EAFIT Run. Roda todo dia (workflow run-events-sync)
// e à mão:
//
//   node scripts/run-events-import.mjs --all
//   node scripts/run-events-import.mjs ES MG --max-details 100 --dry
//
// Variáveis: SUPABASE_ACCESS_TOKEN (obrigatória; o mesmo segredo do deploy do
// Supabase) e SUPABASE_PROJECT_ID (padrão: o projeto do EAFIT). As consultas
// vão pela API de gerenciamento do Supabase.
//
// Por UF:
//  - prova nova: abre a página dela (data completa, largada, link do
//    organizador), localiza a cidade (Open-Meteo geocoding) e grava. Entra JÁ
//    APROVADA quando está completa (data, cidade, coordenadas, distância e
//    link); incompleta fica em rascunho para o admin revisar.
//  - prova que mudou (nome, dia/mês ou distâncias): atualiza os dados, sem
//    mexer no status que o admin definiu.
//  - prova que sumiu do calendário: conta uma falta; na 2ª seguida, uma
//    aprovada volta para rascunho (sai do app até alguém conferir).
// Calendário vazio ou muito menor que o do banco é tratado como falha do site:
// nada é marcado como sumido.
//
// Uso com calma: 1 requisição por segundo, identificada. Os dados são do
// CorridasBR; o app sempre linka para o organizador e pede para confirmar.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://www.corridasbr.com.br';
const UA = 'EAFIT-calendario/1.0 (sincronizacao de provas)';
const DELAY_MS = 1000;
const SOURCE = 'corridasbr';
const DEFAULT_PROJECT = 'btzdetvoneyhzthsmdrp';
const DEFAULT_MAX_DETAILS = 300;
const MISSES_TO_HIDE = 2;

export const UF_NAMES = {
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

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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
  const body = String(html).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const text = decodeEntities(body.replace(/<\/(td|tr|div|p)>/gi, '\n').replace(/<[^>]+>/g, ' '))
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
    if (!/^https?:\/\/\S+$/i.test(url) || /corridasbr\.com\.br/i.test(url) || url.length > 500) url = null;
  }
  const venue = after('Largada:');
  return { date: d ? `${d[3]}-${d[2]}-${d[1]}` : null, venue: venue && !/^largada/i.test(venue) ? venue.slice(0, 120) : '', url };
}

const pad = dayMonth => dayMonth.split('.').map(p => p.padStart(2, '0')).join('.');
const sameList = (a, b) => a.length === b.length && a.every((v, i) => Number(v) === Number(b[i]));

// Compara o calendário de hoje com o que está no banco.
//  fresh: provas que ainda não existem; changed: mudaram; same: iguais;
//  missing: estão no banco (futuras) e não estão mais no calendário.
export function diffCalendar(list, existing, today = new Date()) {
  const byId = new Map(existing.map(e => [e.source_id, e]));
  const seen = new Set(list.map(i => i.id));
  const fresh = [];
  const changed = [];
  const same = [];
  for (const item of list) {
    const ex = byId.get(item.id);
    if (!ex) { fresh.push(item); continue; }
    const exDay = `${String(ex.event_date).slice(8, 10)}.${String(ex.event_date).slice(5, 7)}`;
    const exDist = (ex.distances || []).map(Number).sort((a, b) => b - a);
    const newDist = [...item.distances].sort((a, b) => b - a);
    if (ex.name !== item.name || exDay !== pad(item.dayMonth) || !sameList(exDist, newDist)) changed.push(item);
    else same.push(item);
  }
  const todayIso = iso(today);
  const missing = existing.filter(e => !seen.has(e.source_id) && String(e.event_date) >= todayIso);
  return { fresh, changed, same, missing };
}

// Entra aprovada só quando a prova está completa.
export const isComplete = r => !!(r.event_date && r.city && r.lat != null && r.lng != null && r.distances.length && r.url);

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

// ---- SQL --------------------------------------------------------------------

const q = v => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const dist = list => `'{${list.join(',')}}'::numeric[]`;

export function insertSql(rows) {
  if (!rows.length) return '';
  const values = rows.map(r => `(${[
    q(r.name), q(r.event_date), q(r.city), q(r.state), q(r.venue), r.lat ?? 'null', r.lng ?? 'null', dist(r.distances),
    q(r.url), q(SOURCE), q(r.source_id), q(r.source_url), q(isComplete(r) ? 'approved' : 'draft'), 'now()',
  ].join(', ')})`).join(',\n');
  return `insert into public.run_events (name, event_date, city, state, venue, lat, lng, distances, url, source, source_id, source_url, status, last_seen_at)
values
${values}
on conflict (source, source_id) do nothing;`;
}

// Atualiza os dados de uma prova que mudou; status e coordenadas já salvas ficam.
export function updateSql(r) {
  return `update public.run_events set name = ${q(r.name)}, event_date = ${q(r.event_date)}, city = ${q(r.city)}, venue = coalesce(${q(r.venue)}, venue),
  lat = coalesce(lat, ${r.lat ?? 'null'}), lng = coalesce(lng, ${r.lng ?? 'null'}), distances = ${dist(r.distances)}, url = coalesce(${q(r.url)}, url),
  source_url = ${q(r.source_url)}, last_seen_at = now(), missed_runs = 0
where source = ${q(SOURCE)} and source_id = ${q(r.source_id)};`;
}

export function seenSql(ids) {
  if (!ids.length) return '';
  return `update public.run_events set last_seen_at = now(), missed_runs = 0
where source = ${q(SOURCE)} and source_id in (${ids.map(q).join(', ')});`;
}

export function missedSql(ids) {
  if (!ids.length) return '';
  return `update public.run_events set missed_runs = missed_runs + 1,
  status = case when missed_runs + 1 >= ${MISSES_TO_HIDE} and status = 'approved' then 'draft' else status end
where source = ${q(SOURCE)} and source_id in (${ids.map(q).join(', ')});`;
}

async function runSql(query, { token, project }) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

async function syncState(uf, ctx) {
  const { opts, db, stats } = ctx;
  const list = parseCalendar(await getHtml(`${BASE}/${uf}/Calendario.asp`));
  const existing = await runSql(`select source_id, name, event_date::text as event_date, distances, status, missed_runs from public.run_events where source = ${q(SOURCE)} and state = ${q(uf)};`, db);
  const { fresh, changed, same, missing } = diffCalendar(list, existing);
  const futureKnown = existing.filter(e => String(e.event_date) >= iso(new Date())).length;
  // Calendário vazio ou muito menor que o do banco: o site falhou, não deu para saber o que sumiu.
  const trustworthy = list.length > 0 && list.length >= futureKnown * 0.5;
  console.error(`[${uf}] ${list.length} no calendário · ${fresh.length} novas · ${changed.length} alteradas · ${missing.length} sumidas${trustworthy ? '' : ' (calendário suspeito: não marco sumidas)'}`);

  const inserts = [];
  const updates = [];
  const seenIds = same.map(i => i.id);
  const todayIso = iso(new Date());
  for (const item of [...changed, ...fresh]) {
    const isNew = fresh.includes(item);
    if (stats.details >= opts.maxDetails) { if (!isNew) seenIds.push(item.id); stats.deferred += 1; continue; }
    const sourceUrl = `${BASE}/${uf}/mostracorrida.asp?escolha=${item.id}`;
    let info = { date: null, venue: '', url: null };
    await sleep(DELAY_MS);
    stats.details += 1;
    try { info = parseDetail(await getHtml(sourceUrl)); } catch (err) { console.error(`  ! ${item.id}: ${err.message}`); if (!isNew) seenIds.push(item.id); continue; }
    const date = info.date || inferDate(item.dayMonth);
    if (!date || !item.name || (isNew && date < todayIso)) continue;
    const geo = item.city ? await geocode(item.city, uf) : null;
    const row = {
      name: item.name.slice(0, 120), event_date: date, city: item.city.slice(0, 80) || null, state: uf, venue: info.venue || null,
      lat: geo?.lat ?? null, lng: geo?.lng ?? null, distances: item.distances, url: info.url, source_id: item.id, source_url: sourceUrl,
    };
    (isNew ? inserts : updates).push(row);
  }
  stats.inserted += inserts.length;
  stats.autoApproved += inserts.filter(isComplete).length;
  stats.updated += updates.length;
  stats.missing += trustworthy ? missing.length : 0;
  if (opts.dry) return;
  for (const part of chunks(inserts, 100)) await runSql(insertSql(part), db);
  for (const part of chunks(updates, 50)) await runSql(part.map(updateSql).join('\n'), db);
  for (const part of chunks(seenIds, 200)) await runSql(seenSql(part), db);
  if (trustworthy) for (const part of chunks(missing.map(m => m.source_id), 200)) await runSql(missedSql(part), db);
}

export function parseArgs(argv) {
  const opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const all = argv.includes('--all');
  const ufs = all ? Object.keys(UF_NAMES) : argv.filter(a => /^[A-Za-z]{2}$/.test(a)).map(a => a.toUpperCase()).filter(uf => UF_NAMES[uf]);
  const max = Number(opt('--max-details'));
  return { ufs, dry: argv.includes('--dry'), maxDetails: Number.isFinite(max) && max >= 0 && opt('--max-details') != null ? max : DEFAULT_MAX_DETAILS };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!opts.ufs.length || !token) {
    console.error('Uso: SUPABASE_ACCESS_TOKEN=... node scripts/run-events-import.mjs --all | ES MG ... [--max-details 300] [--dry]');
    process.exit(1);
  }
  const ctx = { opts, db: { token, project: process.env.SUPABASE_PROJECT_ID || DEFAULT_PROJECT }, stats: { details: 0, deferred: 0, inserted: 0, autoApproved: 0, updated: 0, missing: 0 } };
  let failed = 0;
  for (const uf of opts.ufs) {
    try { await syncState(uf, ctx); } catch (err) { failed += 1; console.error(`[${uf}] falhou: ${err.message}`); }
  }
  const s = ctx.stats;
  console.error(`${opts.dry ? '[simulação] ' : ''}${s.inserted} novas (${s.autoApproved} aprovadas sozinhas), ${s.updated} alteradas, ${s.missing} sumidas, ${s.deferred} adiadas para a próxima rodada, ${failed} UF(s) com falha.`);
  if (failed === opts.ufs.length) process.exit(1);
}

const isSamePath = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();
if (process.argv[1] && isSamePath(fileURLToPath(import.meta.url), process.argv[1])) {
  main().catch(err => { console.error(err); process.exit(1); });
}
