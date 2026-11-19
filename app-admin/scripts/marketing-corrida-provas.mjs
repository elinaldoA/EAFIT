// Carrosséis "Corridas em <estado>" do módulo Corrida (EAFIT Run), feitos com as provas APROVADAS do
// banco (run_events) dos próximos meses. Usa a CLI do Supabase já logada (supabase db query --linked).
//
//   node app-admin/scripts/marketing-corrida-provas.mjs
//
// Os dados envelhecem: rode de novo perto de liberar o módulo (as imagens e o SQL são regerados).
// Saída: corrida-provas-<uf>-<aaaamm>-*.jpg em app-react/public/landing/img/marketing/ e o SQL
// supabase/migrations/20270228020000_marketing_corrida_provas_estado.sql.txt (renomear para .sql e aplicar
// só depois de publicar as imagens).
import { createCanvas } from '@napi-rs/canvas';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FONT, SIZES, background, footer, printArt, slideArt, wrap } from './marketing-autopost-content.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(root, 'app-react', 'public', 'landing', 'img', 'marketing');
const SITE = 'https://eafit.com.br';
const TAGS = '#corrida #corridaderua #running #provasdecorrida #embreve #EAFIT';
const CTA = 'Fique de olho: em breve no EAFIT. 👀';
const FOOTER = 'Em breve · eafit.com.br';
const FROM_DAYS = 21;
const TO_DAYS = 75;
const MAX_STATES = 8;
const MIN_EVENTS = 6;
const PER_SLIDE = 4;
const MAX_EVENTS = 8;

const STATES = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

function query(sql) {
  const flat = sql.replace(/\s+/g, ' ').trim();
  const r = spawnSync('supabase', ['db', 'query', '--linked', `"${flat}"`], { encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
  const m = /\{\s*"boundary"[\s\S]*?\n\}/.exec(r.stdout || '');
  if (!m) throw new Error(`Consulta falhou: ${r.stdout}\n${r.stderr}`);
  return JSON.parse(m[0]).rows;
}

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const title = (s) => clean(s).toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
  .replace(/ (De|Da|Do|Das|Dos|E) /g, (w) => w.toLowerCase());
const fmtDate = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const fmtDist = (a) => {
  const ds = (a || []).map(Number).filter((n) => n > 0).sort((x, y) => x - y).map((n) => (Number.isInteger(n) ? String(n) : String(n).replace('.', ',')));
  return ds.length ? `${ds.join(', ')} km` : '';
};

function eventSlide(uf, events, page, pages) {
  const [w, h] = SIZES.feed;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  background(ctx, w, h);
  const pad = 80;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#f97316';
  ctx.font = `800 44px ${FONT}`;
  ctx.fillText(`CORRIDAS EM ${uf}  ·  ${page}/${pages}`, pad, 90);
  let y = 220;
  for (const e of events) {
    ctx.fillStyle = '#f97316';
    ctx.font = `800 60px ${FONT}`;
    ctx.fillText(fmtDate(e.event_date), pad, y);
    ctx.fillStyle = '#fff';
    ctx.font = `800 46px ${FONT}`;
    let name = title(e.name);
    let lines;
    for (;;) {
      try { lines = wrap(ctx, name, w - pad * 2 - 220, 2); break; } catch { name = `${name.slice(0, Math.max(10, name.length - 8)).trim()}…`; }
    }
    let ny = y;
    for (const line of lines) { ctx.fillText(line, pad + 220, ny); ny += 56; }
    ctx.fillStyle = '#a1a1aa';
    ctx.font = `500 38px ${FONT}`;
    const meta = [title(e.city), fmtDist(e.distances)].filter(Boolean).join('  ·  ');
    if (meta) { ctx.fillText(meta, pad + 220, ny + 6); ny += 50; }
    y = Math.max(y + 130, ny) + 80;
  }
  footer(ctx, w, h);
  return canvas.toBuffer('image/jpeg', 90);
}

const sqlText = (s) => `'${s.replace(/'/g, "''")}'`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const rows = query(`select state, event_date::text, name, city, distances from public.run_events
    where status = 'approved' and event_date between current_date + ${FROM_DAYS} and current_date + ${TO_DAYS}
    order by state, event_date, name`);
  const byState = new Map();
  for (const r of rows) {
    if (!byState.has(r.state)) byState.set(r.state, []);
    byState.get(r.state).push(r);
  }
  const chosen = [...byState.entries()].filter(([, a]) => a.length >= MIN_EVENTS)
    .sort((a, b) => b[1].length - a[1].length).slice(0, MAX_STATES);
  const stamp = new Date().toISOString().slice(0, 7).replace('-', '');
  const items = [];
  for (const [uf, all] of chosen) {
    const events = all.slice(0, MAX_EVENTS);
    const key = `corrida-provas-${uf.toLowerCase()}-${stamp}`;
    const name = STATES[uf] || uf;
    const files = [`${key}-1.jpg`];
    writeFileSync(join(OUT, files[0]), slideArt(`Corridas em ${name}`, { big: true, small: 'Próximas provas · deslize →' }));
    const pages = Math.ceil(events.length / PER_SLIDE);
    for (let p = 0; p < pages; p += 1) {
      const f = `${key}-${p + 2}.jpg`;
      writeFileSync(join(OUT, f), eventSlide(uf, events.slice(p * PER_SLIDE, (p + 1) * PER_SLIDE), p + 1, pages));
      files.push(f);
    }
    const last = `${key}-${pages + 2}.jpg`;
    writeFileSync(join(OUT, last), await printArt({ headline: 'Em breve: as provas do seu estado', sub: 'Próximas corridas no EAFIT Run.', print: 'run-inicio' }, 'feed', FOOTER));
    files.push(last);
    const caption = `Vai correr em ${name}? 🏁\nSalve este post: separamos as próximas provas do estado. Confira datas e inscrição no site de cada organizador.\nEm breve no EAFIT Run: as corridas perto de você e a sua preparação no app.\n\n${CTA}\n\n${TAGS} #${name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '').toLowerCase()}`;
    items.push({ key: `${key}-feed`, caption, media: JSON.stringify(files.map((f) => ({ type: 'image', url: `${SITE}/img/marketing/${f}` }))) });
    console.log('ok', uf, `${events.length} provas (de ${all.length}), ${files.length} imagens`);
  }
  if (!items.length) throw new Error('Nenhum estado com provas suficientes');
  const values = items.map((it, i) => `  (${i + 1}, ${sqlText(it.key)}, 'feed', ${sqlText(it.caption)}, ${sqlText(it.media)})`);
  const sql = `-- Marketing do módulo Corrida: carrosséis "Corridas em <estado>" (provas aprovadas de ${FROM_DAYS} a ${TO_DAYS} dias a partir de ${new Date().toISOString().slice(0, 10)}).
-- Gerado por app-admin/scripts/marketing-corrida-provas.mjs. Os dados envelhecem: regerar perto de liberar o módulo.
-- Aplicar só depois de publicar as imagens. Texto "Em breve": entram no fim da fila e saem com o módulo Corrida DESLIGADO (param quando ele liga).
insert into public.marketing_autopost_queue (position, key, format, caption, media, hide_when_module)
select (select coalesce(max(position), 0) from public.marketing_autopost_queue) + v.n, v.key, v.format, v.caption, v.media::jsonb, 'corrida'
from (values
${values.join(',\n')}
) as v(n, key, format, caption, media)
where not exists (select 1 from public.marketing_autopost_queue q where q.key = v.key);
`;
  writeFileSync(join(root, 'supabase', 'migrations', '20270228020000_marketing_corrida_provas_estado.sql.txt'), sql);
  console.log(`${items.length} carrosséis (SQL gerado)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
