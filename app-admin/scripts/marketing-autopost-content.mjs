// Conteúdo da publicação automática do Marketing: feito só com os prints do
// próprio app (landing/img/app) e slides de texto na identidade da marca.
//
//   node app-admin/scripts/marketing-autopost-content.mjs
//
// Gera as artes em JPEG (o Instagram não aceita WebP) em
// app-react/public/landing/img/marketing/ e o seed SQL em
// supabase/migrations/20261230010000_marketing_autopost.seed.sql.txt, que foi
// colado na migration. Rodar de novo só quando o conteúdo mudar.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PRINTS = join(root, 'app-react', 'public', 'landing', 'img', 'app');
const OUT = join(root, 'app-react', 'public', 'landing', 'img', 'marketing');
const SITE = 'https://eafit.com.br';
const TAGS = '#personaltrainer #treino #appdetreino #academia #musculacao';

const SIZES = { feed: [1080, 1350], story: [1080, 1920] };

// kind: 'print' (uma arte com o print) | 'slides' (carrossel de texto)
export const ITEMS = [
  {
    key: 'treino', kind: 'print', print: 'treino', headline: 'Treino pronto em segundos', sub: 'Monte, envie e acompanhe.',
    caption: `Planilha, PDF, WhatsApp… dá para parar. 📲\nMonte o treino no app e ele chega direto no celular do aluno.\n\nLink na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'evolucao', kind: 'print', print: 'evolucao', headline: 'Quem vê a evolução não desiste', sub: 'Cada carga e cada série viram progresso.',
    caption: `Aluno que não vê resultado, desiste. 💔\nMostre a evolução de cada carga e de cada série. O app faz isso sozinho.\n\nLink na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'sinais', kind: 'slides', headline: '5 sinais de que seu aluno vai cancelar',
    slides: [
      ['1', 'Falta duas semanas seguidas'],
      ['2', 'Para de registrar as cargas'],
      ['3', 'Responde só “ok” às mensagens'],
      ['4', 'Reclama que “não vê resultado”'],
      ['5', 'Pede para pausar o plano'],
    ],
    closing: 'Acompanhe tudo em um só lugar.',
    caption: `Perder aluno quase nunca é surpresa. Os sinais aparecem antes. 👀\nSalve este post e confira com seus alunos hoje.\n\nLink na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'ao-vivo', kind: 'print', print: 'ao-vivo', headline: 'Registre cada série na hora', sub: 'Treino ao vivo, sem papel.',
    caption: `Cada série registrada vira evolução que dá para ver. 📈\nAluno que enxerga o progresso treina mais motivado.\n\nLink na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'retencao', kind: 'slides', headline: 'Como reter alunos por mais tempo',
    slides: [
      ['1', 'Mostre a evolução com números'],
      ['2', 'Dê feedback depois de cada treino'],
      ['3', 'Ajuste a carga antes que ele estagne'],
      ['4', 'Esteja presente, mesmo à distância'],
    ],
    closing: 'Tudo isso num só app.',
    caption: `Reter aluno custa menos do que conquistar um novo. 💡\nSalve este post e aplique ainda esta semana.\n\nLink na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'historico', kind: 'print', print: 'historico', headline: 'Todo o histórico num só lugar', sub: 'Treinos, cargas e datas sempre à mão.',
    caption: `Chega de perguntar “quanto foi que você fez semana passada?”. 🧠\nO histórico completo de cada treino fica no app.\n\nLink na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'nutricao', kind: 'print', print: 'nutricao', headline: 'Treino e alimentação juntos', sub: 'Calorias e macros no mesmo app.',
    caption: `Resultado vem do treino e da comida. 🍽️\nNo app, o aluno acompanha as duas coisas num só lugar.\n\nLink na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'agua', kind: 'print', print: 'agua', headline: 'Meta de água em dia', sub: 'Um hábito simples que muda o treino.',
    caption: `Hidratação também é treino. 💧\nO app lembra e registra a meta diária de água.\n\nLink na bio 👇\n\n${TAGS}`,
  },
];

const FONT = 'Arial, Helvetica, sans-serif';

function background(ctx, w, h) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#17171b');
  bg.addColorStop(1, '#0e0e12');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * 0.8, h * 0.15, 0, w * 0.8, h * 0.15, w * 0.7);
  glow.addColorStop(0, 'rgba(249,115,22,.35)');
  glow.addColorStop(1, 'rgba(249,115,22,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
}

function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) throw new Error(`Texto longo demais: ${text}`);
  return lines;
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

function footer(ctx, w, h) {
  ctx.fillStyle = '#f97316';
  ctx.font = `700 40px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('eafit.com.br', w / 2, h - 80);
}

async function printArt(item, format) {
  const [w, h] = SIZES[format];
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  background(ctx, w, h);
  const pad = 72;
  let y = pad + 40;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.font = `800 68px ${FONT}`;
  for (const line of wrap(ctx, item.headline, w - pad * 2, 2)) { ctx.fillText(line, pad, y); y += 80; }
  ctx.fillStyle = '#a1a1aa';
  ctx.font = `500 36px ${FONT}`;
  for (const line of wrap(ctx, item.sub, w - pad * 2, 2)) { ctx.fillText(line, pad, y + 6); y += 46; }
  const top = y + 40;
  const img = await loadImage(readFileSync(join(PRINTS, `${item.print}.webp`)));
  const maxH = h - top - 130;
  const scale = Math.min((w - pad * 2) / img.width, maxH / img.height);
  const iw = img.width * scale;
  const ih = img.height * scale;
  const ix = (w - iw) / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.6)';
  ctx.shadowBlur = 50;
  roundRect(ctx, ix, top, iw, ih, 36);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, ix, top, iw, ih, 36);
  ctx.clip();
  ctx.drawImage(img, ix, top, iw, ih);
  ctx.restore();
  footer(ctx, w, h);
  return canvas.toBuffer('image/jpeg', 90);
}

function slideArt(lines, { big = false, number = null, small = '' } = {}) {
  const [w, h] = SIZES.feed;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  background(ctx, w, h);
  const pad = 90;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  if (number) {
    ctx.fillStyle = '#f97316';
    ctx.font = `800 260px ${FONT}`;
    ctx.fillText(number, pad, 250);
  }
  ctx.fillStyle = '#fff';
  const size = big ? 84 : 76;
  ctx.font = `800 ${size}px ${FONT}`;
  const wrapped = wrap(ctx, lines, w - pad * 2, 5);
  let y = number ? 600 : 420;
  for (const line of wrapped) { ctx.fillText(line, pad, y); y += size + 18; }
  if (small) {
    ctx.fillStyle = '#a1a1aa';
    ctx.font = `500 40px ${FONT}`;
    ctx.fillText(small, pad, y + 30);
  }
  footer(ctx, w, h);
  return canvas.toBuffer('image/jpeg', 90);
}

const sqlText = (s) => `'${s.replace(/'/g, "''")}'`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const rows = [];
  let position = 0;
  const add = (format, item, files) => {
    position += 1;
    const media = files.map((f) => ({ type: 'image', url: `${SITE}/img/marketing/${f}` }));
    rows.push(`  (${position}, ${sqlText(`${item.key}-${format}`)}, ${sqlText(format)}, ${sqlText(format === 'story' ? '' : item.caption)}, ${sqlText(JSON.stringify(media))}::jsonb)`);
  };

  for (const item of ITEMS) {
    if (item.kind === 'print') {
      const feedFile = `${item.key}-feed.jpg`;
      const storyFile = `${item.key}-story.jpg`;
      writeFileSync(join(OUT, feedFile), await printArt(item, 'feed'));
      writeFileSync(join(OUT, storyFile), await printArt(item, 'story'));
      add('feed', item, [feedFile]);
      add('story', item, [storyFile]);
    } else {
      const files = [];
      const cover = `${item.key}-1.jpg`;
      writeFileSync(join(OUT, cover), slideArt(item.headline, { big: true, small: 'Deslize →' }));
      files.push(cover);
      item.slides.forEach(([n, text], i) => {
        const f = `${item.key}-${i + 2}.jpg`;
        writeFileSync(join(OUT, f), slideArt(text, { number: n }));
        files.push(f);
      });
      const last = `${item.key}-${item.slides.length + 2}.jpg`;
      writeFileSync(join(OUT, last), slideArt(item.closing, { big: true, small: 'Link na bio.' }));
      files.push(last);
      add('feed', item, files);
    }
  }
  writeFileSync(join(root, 'supabase', 'migrations', '20261230010000_marketing_autopost.seed.sql.txt'), rows.join(',\n') + ';\n');
  console.log(`${position} itens, artes em ${OUT}`);
}

main();
