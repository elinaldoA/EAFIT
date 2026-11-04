// Reels da publicação automática do Marketing: vídeos verticais (9:16, 12 s)
// feitos só com os prints do próprio app. Cada Reel tem 3 cenas: gancho em
// texto → print do app entrando com o título → chamada para o link da bio.
//
//   node app-admin/scripts/marketing-reels.mjs
//
// Precisa do ffmpeg no PATH. Gera os MP4 em app-react/public/landing/img/marketing/
// (reel-*.mp4) e o seed SQL da segunda leva em supabase/migrations/20270101010000_marketing_autopost_dedup.reels.sql.txt.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PRINTS = join(root, 'app-react', 'public', 'landing', 'img', 'app');
const OUT = join(root, 'app-react', 'public', 'landing', 'img', 'marketing');
const SITE = 'https://eafit.com.br';
const TAGS = '#personaltrainer #treino #appdetreino #academia #musculacao';
const W = 1080;
const H = 1920;
const FPS = 24;
const DURATION = 12;
const FONT = 'Arial, Helvetica, sans-serif';

const REELS = [
  {
    key: 'treino', print: 'treino', hook: 'Ainda monta treino em planilha?', title: 'Treino pronto em segundos', sub: 'Monte, envie e acompanhe.',
    caption: `Planilha, PDF, WhatsApp… dá para parar. 📲\nMonte o treino no app e ele chega direto no celular do aluno.\n\nLink na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'evolucao', print: 'evolucao', hook: 'Seu aluno enxerga a própria evolução?', title: 'Quem vê a evolução não desiste', sub: 'Cada carga vira progresso.',
    caption: `Aluno que não vê resultado, desiste. 💔\nNo app, cada carga e cada série viram evolução visível.\n\nLink na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'ao-vivo', print: 'ao-vivo', hook: 'Chega de anotar série no papel', title: 'Registre cada série na hora', sub: 'Treino ao vivo, sem papel.',
    caption: `Registrou, está no histórico. 💪\nO treino ao vivo guarda carga e repetição de cada série.\n\nLink na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'nutricao', print: 'nutricao', hook: 'Treino e dieta em apps diferentes?', title: 'Tudo no mesmo app', sub: 'Treino, calorias e macros juntos.',
    caption: `Resultado vem do treino e da comida. 🍽️\nO aluno acompanha as duas coisas num só lugar.\n\nLink na bio 👇\n\n${TAGS}`,
  },
  // Segunda leva (migration 20270101010000): temas novos, legendas diferentes das do feed.
  {
    key: 'historico', later: true, print: 'historico', hook: 'Qual foi a carga do aluno semana passada?', title: 'Todo o histórico num só lugar', sub: 'Treinos, cargas e datas sempre à mão.',
    caption: `Esqueceu a carga do último treino? 🧠
No histórico do app, cada treino fica salvo com data, carga e repetições.

Link na bio 👇

${TAGS}`,
  },
  {
    key: 'agua', later: true, print: 'agua', hook: 'Seu aluno bebe água o suficiente?', title: 'Meta de água em dia', sub: 'Um hábito simples que muda o treino.',
    caption: `Treinar desidratado rende menos. 💧
O app registra a meta diária de água do aluno.

Link na bio 👇

${TAGS}`,
  },
];

const clamp = (v) => Math.min(1, Math.max(0, v));
const easeOut = (v) => 1 - (1 - clamp(v)) ** 3;
// Aparece em [a, a+0.5] e some em [b-0.4, b].
const fade = (t, a, b) => clamp((t - a) / 0.5) * clamp((b - t) / 0.4);

function background(ctx) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#17171b');
  bg.addColorStop(1, '#0e0e12');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.8, H * 0.12, 0, W * 0.8, H * 0.12, W * 0.9);
  glow.addColorStop(0, 'rgba(249,115,22,.35)');
  glow.addColorStop(1, 'rgba(249,115,22,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

function lines(ctx, text, maxWidth) {
  const out = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) { out.push(line); line = word; } else line = next;
  }
  if (line) out.push(line);
  return out;
}

function text(ctx, str, { x, y, size, weight = 800, color = '#fff', align = 'left', alpha = 1, maxWidth = W - 144, gap = 1.15 }) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  let yy = y;
  for (const line of lines(ctx, str, maxWidth)) {
    ctx.fillText(line, x, yy);
    yy += size * gap;
  }
  ctx.restore();
  return yy;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function frame(ctx, reel, img, t) {
  background(ctx);

  // Cena 1 (0–3,6 s): gancho.
  const a1 = fade(t, 0.15, 3.6);
  if (a1 > 0) {
    const dy = (1 - easeOut((t - 0.15) / 0.7)) * 60;
    text(ctx, reel.hook, { x: W / 2, y: 700 + dy, size: 96, align: 'center', alpha: a1 });
  }

  // Cena 2 (3,4–9,8 s): título e print do app entrando de baixo.
  const a2 = fade(t, 3.4, 9.8);
  if (a2 > 0) {
    const y = text(ctx, reel.title, { x: 72, y: 130, size: 78, alpha: a2 });
    text(ctx, reel.sub, { x: 72, y: y + 8, size: 42, weight: 500, color: '#a1a1aa', alpha: a2 });
    const top = 440;
    const maxH = H - top - 190;
    const slide = easeOut((t - 3.5) / 0.9);
    const zoom = 1 + 0.05 * clamp((t - 4.4) / 5);
    const base = Math.min((W - 144) / img.width, maxH / img.height);
    const iw = img.width * base * zoom;
    const ih = img.height * base * zoom;
    const ix = (W - iw) / 2;
    const iy = top + (1 - slide) * 700;
    ctx.save();
    ctx.globalAlpha = a2;
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.shadowBlur = 50;
    roundRect(ctx, ix, iy, iw, ih, 40);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = a2;
    roundRect(ctx, ix, iy, iw, ih, 40);
    ctx.clip();
    ctx.drawImage(img, ix, iy, iw, ih);
    ctx.restore();
  }

  // Cena 3 (9,6–12 s): chamada.
  const a3 = clamp((t - 9.6) / 0.5);
  if (a3 > 0) {
    ctx.save();
    ctx.globalAlpha = a3;
    ctx.fillStyle = '#0e0e12';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    const dy = (1 - easeOut((t - 9.7) / 0.6)) * 50;
    text(ctx, 'Conheça o app', { x: W / 2, y: 640 + dy, size: 104, align: 'center', alpha: a3 });
    text(ctx, 'Link na bio', { x: W / 2, y: 840 + dy, size: 64, weight: 600, color: '#a1a1aa', align: 'center', alpha: a3 });
    text(ctx, 'eafit.com.br', { x: W / 2, y: 1000 + dy, size: 72, weight: 700, color: '#f97316', align: 'center', alpha: a3 });
  }
}

async function render(reel) {
  const img = await loadImage(readFileSync(join(PRINTS, `${reel.print}.webp`)));
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const file = join(OUT, `reel-${reel.key}.mp4`);
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-t', String(DURATION), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-preset', 'medium', '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '64k', '-shortest', '-movflags', '+faststart', file,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) => {
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg saiu com ${code}`))));
    ff.on('error', reject);
  });
  ff.stdin.on('error', () => {});
  for (let i = 0; i < DURATION * FPS; i += 1) {
    frame(ctx, reel, img, i / FPS);
    const rgba = Buffer.from(ctx.getImageData(0, 0, W, H).data.buffer);
    if (!ff.stdin.write(rgba)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await done;
}

const sqlText = (s) => `'${s.replace(/'/g, "''")}'`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const only = process.env.ONLY; // 'later' renderiza só a segunda leva
  const rows = [];
  const laterRows = [];
  let position = 14;
  let laterPosition = 20; // depois dos 14 itens de feed/story já na fila
  for (const reel of REELS) {
    if (only === 'later' && !reel.later) continue;
    await render(reel);
    const media = [{ type: 'video', url: `${SITE}/img/marketing/reel-${reel.key}.mp4` }];
    if (reel.later) {
      laterPosition += 1;
      laterRows.push(`  (${laterPosition}, ${sqlText(`${reel.key}-reel`)}, 'reel', ${sqlText(reel.caption)}, ${sqlText(JSON.stringify(media))}::jsonb)`);
      console.log('ok', reel.key);
      continue;
    }
    position += 1;
    rows.push(`  (${position}, ${sqlText(`${reel.key}-reel`)}, 'reel', ${sqlText(reel.caption)}, ${sqlText(JSON.stringify(media))}::jsonb)`);
    console.log('ok', reel.key);
  }
  writeFileSync(join(root, 'supabase', 'migrations', '20270101010000_marketing_autopost_dedup.reels.sql.txt'), laterRows.join(',\n') + ';\n');
}

main();
