// Peças de SUSPENSE do EAFIT Run para o período antes do lançamento (21/11 a 30/11): só texto, sem telas do app e
// sem citar funcionalidades do módulo. Servem para manter a audiência interessada e levar para a lista de espera
// (eafit.com.br/corrida/?origem=<rede>#avise-me; a legenda guarda origem=post e a publicação troca pela rede).
// Saem enquanto o módulo está desligado (hide_when_module = 'corrida') e param quando ele liga.
//
//   node app-admin/scripts/marketing-corrida-suspense.mjs        (precisa do ffmpeg no PATH para os Reels)
//   ONLY=imagens node app-admin/scripts/marketing-corrida-suspense.mjs   (stories e feeds, sem vídeo)
//
// Saída: suspense-corrida-* em app-react/public/landing/img/marketing/ e a migration
// supabase/migrations/20270304140000_marketing_corrida_suspense_pecas.sql.
import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeWav } from './marketing-reels-audio.mjs';
import { FONT, SIZES, background, footer, wrap } from './marketing-autopost-content.mjs';
import { audioPlan, renderVideo } from './marketing-corrida-launch.mjs';
import { DURATION } from '../src/lib/reelRender.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(root, 'app-react', 'public', 'landing', 'img', 'marketing');
const SITE = 'https://eafit.com.br';
const TAGS = '#corrida #corridaderua #running #embreve #EAFIT';
const CTA = 'Quer ser avisado quando abrir? Entre na lista de espera: eafit.com.br/corrida/?origem=post#avise-me 🏃';
const ACCENT = '#f97316';
const URL_SHOWN = 'eafit.com.br/corrida';

// Stories (imagem 1080x1920): [chave, frase grande, frase pequena]
export const STORIES = [
  ['s01', 'Você corre?', 'Tem novidade vindo aí.'],
  ['s02', 'Algo novo no EAFIT.', 'Para quem ama correr.'],
  ['s03', 'Calce o tênis.', 'Dia 1º de dezembro.'],
  ['s04', 'Quem corre vai entender.', 'Em breve.'],
  ['s05', 'O EAFIT vai correr com você.', 'Aguarde.'],
  ['s06', 'Faltam poucos dias.', 'Dia 1º de dezembro.'],
  ['s07', 'Sua próxima corrida começa aqui.', 'Em breve no EAFIT.'],
  ['s08', 'Já tem plano para dezembro?', 'O EAFIT tem novidade.'],
  ['s09', 'Quer ser o primeiro a saber?', 'Entre na lista de espera.'],
  ['s10', 'Contagem regressiva.', '1º de dezembro, às 10h.'],
];

// Feeds (imagem 1080x1350): [chave, frase grande, frase pequena, legenda]
export const FEEDS = [
  ['f01', 'Quem corre vai entender.', 'Algo novo chega ao EAFIT em breve.',
    'Quem corre vai entender. 🏃\nAquela vontade de calçar o tênis e sair já tem novidade a caminho no EAFIT.'],
  ['f02', 'Manhã ou noite?', 'Quando você corre?',
    'Manhã, noite ou fim de semana? 🌅🌙\nConta nos comentários quando você corre. Vem novidade no EAFIT para quem ama correr.'],
  ['f03', 'Anote na agenda.', '1º de dezembro, às 10h.',
    'Anote na agenda: 1º de dezembro, às 10h. 📅\nA novidade do EAFIT para quem ama correr abre para todo mundo nesse dia.'],
  ['f04', 'Falta pouco.', 'Dia 1º de dezembro. Você corre?',
    'Falta pouco. ⏳\nDia 1º de dezembro tem novidade para quem corre. Entre na lista de espera e seja avisado.'],
];

// Reels (vídeo 1080x1920, 12 s): [chave, frase 1, frase 2, legenda]
export const REELS = [
  ['r01', 'Você corre?', 'Algo novo vem aí.',
    'Você corre? 🏃\nAlgo novo vem aí no EAFIT, para quem ama correr.'],
  ['r02', 'Quem corre vai entender.', '1º de dezembro.',
    'Quem corre vai entender. 👟\nDia 1º de dezembro tem novidade no EAFIT.'],
  ['r03', 'Prepare o tênis.', 'Dia 1º de dezembro, às 10h.',
    'Prepare o tênis. 👟\nDia 1º de dezembro, às 10h, o EAFIT tem novidade para quem corre.'],
  ['r04', 'Não conta pra ninguém.', 'Ou conta, e chama a turma.',
    'Não conta pra ninguém… ou conta, e chama a turma. 😉\nVem novidade no EAFIT para quem ama correr. Entre na lista de espera.'],
];

function storyArt(big, small) {
  const [w, h] = SIZES.story;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  background(ctx, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const size = 118;
  ctx.font = `800 ${size}px ${FONT}`;
  const lines = wrap(ctx, big, w - 160, 4);
  let y = 560;
  ctx.fillStyle = '#fff';
  for (const l of lines) { ctx.fillText(l, w / 2, y); y += size + 18; }
  ctx.fillStyle = '#a1a1aa';
  ctx.font = `600 58px ${FONT}`;
  ctx.fillText(small, w / 2, y + 36);
  button(ctx, w, h);
  return canvas.toBuffer('image/jpeg', 90);
}

function button(ctx, w, h) {
  const bw = 820;
  const bh = 104;
  const by = h - 300;
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.roundRect((w - bw) / 2, by, bw, bh, bh / 2);
  ctx.fill();
  ctx.fillStyle = '#0e0e12';
  ctx.font = `800 40px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ENTRE NA LISTA DE ESPERA', w / 2, by + bh / 2 + 3);
  ctx.fillStyle = '#fff';
  ctx.font = `700 44px ${FONT}`;
  ctx.fillText(URL_SHOWN, w / 2, by + bh + 52);
}

function feedArt(big, small) {
  const [w, h] = SIZES.feed;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  background(ctx, w, h);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const pad = 90;
  const size = 92;
  ctx.font = `800 ${size}px ${FONT}`;
  const lines = wrap(ctx, big, w - pad * 2, 4);
  let y = 420;
  ctx.fillStyle = '#fff';
  for (const l of lines) { ctx.fillText(l, pad, y); y += size + 18; }
  ctx.fillStyle = ACCENT;
  ctx.fillRect(pad, y + 14, 150, 10);
  ctx.fillStyle = '#a1a1aa';
  ctx.font = `600 46px ${FONT}`;
  ctx.fillText(small, pad, y + 56);
  footer(ctx, w, h, `Em breve · ${URL_SHOWN}`);
  return canvas.toBuffer('image/jpeg', 90);
}

const ease = (x) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;

// Cena 1 (0–4,6 s): frase 1 · cena 2 (4,2–9,2 s): frase 2 · cena 3 (8,8–12 s): lista de espera.
function reelFrame(a, b) {
  return (ctx, _im, t) => {
    const [w, h] = SIZES.story;
    background(ctx, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const draw = (text, y, size, color, alpha, weight = 800) => {
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, alpha));
      ctx.fillStyle = color;
      ctx.font = `${weight} ${size}px ${FONT}`;
      const lines = wrap(ctx, text, w - 160, 3);
      lines.forEach((l, i) => ctx.fillText(l, w / 2, y + i * (size + 14)));
      ctx.restore();
    };
    const in1 = ease(t / 0.8);
    const out1 = 1 - ease((t - 4.2) / 0.5);
    draw(a, 860 + (1 - in1) * 40, 120, '#fff', in1 * out1);
    const in2 = ease((t - 4.4) / 0.8);
    const out2 = 1 - ease((t - 8.8) / 0.5);
    draw(b, 860 + (1 - in2) * 40, 96, '#fff', in2 * out2);
    const in3 = ease((t - 9.0) / 0.6);
    draw('Lista de espera', 800, 92, '#fff', in3);
    draw('Entre e seja avisado', 960, 56, '#a1a1aa', in3, 600);
    draw(URL_SHOWN, 1100, 72, ACCENT, in3, 700);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(0, h - 14, w * Math.min(1, t / DURATION), 14);
  };
}

const sqlText = (s) => `'${s.replace(/'/g, "''")}'`;
const media = (type, file) => JSON.stringify([{ type, url: `${SITE}/img/marketing/${file}` }]);

async function main() {
  mkdirSync(OUT, { recursive: true });
  const items = [];
  for (const [k, big, small] of STORIES) {
    const f = `suspense-corrida-story-${k}.jpg`;
    writeFileSync(join(OUT, f), storyArt(big, small));
    items.push({ key: `suspense-corrida-${k}-story`, format: 'story', caption: '', media: media('image', f) });
    console.log('ok', f);
  }
  for (const [k, big, small, text] of FEEDS) {
    const f = `suspense-corrida-feed-${k}.jpg`;
    writeFileSync(join(OUT, f), feedArt(big, small));
    items.push({ key: `suspense-corrida-${k}-feed`, format: 'feed', caption: `${text}\n\n${CTA}\n\n${TAGS}`, media: media('image', f) });
    console.log('ok', f);
  }
  if (process.env.ONLY !== 'imagens') {
    const plan = await audioPlan(1);
    const wav = join(tmpdir(), 'eafit-reel-suspense.wav');
    writeFileSync(wav, makeWav(DURATION, { style: 'run', bpm: 140, sweeps: [3.4, 9.6] }));
    for (const [i, [k, a, b, text]] of REELS.entries()) {
      const f = `suspense-corrida-reel-${k}.mp4`;
      await renderVideo(f, DURATION, plan.reel(i) || wav, reelFrame(a, b), null);
      items.push({ key: `suspense-corrida-${k}-reel`, format: 'reel', caption: `${text}\n\n${CTA}\n\n${TAGS}`, media: media('video', f) });
      console.log('ok', f);
    }
  }
  const values = items.map((it, i) => `  (${i + 1}, ${sqlText(it.key)}, ${sqlText(it.format)}, ${sqlText(it.caption)}, ${sqlText(it.media)})`);
  const sql = `-- Marketing do Run: peças de SUSPENSE para 21/11 a 30/11 (só texto, sem telas nem funções do módulo), com o convite
-- para a lista de espera. Geradas por app-admin/scripts/marketing-corrida-suspense.mjs. Saem com o módulo desligado
-- (hide_when_module = 'corrida') e param quando ele liga; as peças de lançamento e pós-lançamento seguem à parte.
insert into public.marketing_autopost_queue (position, key, format, caption, media, hide_when_module)
select (select coalesce(max(position), 0) from public.marketing_autopost_queue) + v.n, v.key, v.format, v.caption, v.media::jsonb, 'corrida'
from (values
${values.join(',\n')}
) as v(n, key, format, caption, media)
where not exists (select 1 from public.marketing_autopost_queue q where q.key = v.key);
`;
  writeFileSync(join(root, 'supabase', 'migrations', '20270304140000_marketing_corrida_suspense_pecas.sql'), sql);
  console.log(`${items.length} itens na migration`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
