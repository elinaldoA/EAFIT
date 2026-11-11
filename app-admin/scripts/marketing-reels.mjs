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
import { tmpdir } from 'node:os';
import { makeWav } from './marketing-reels-audio.mjs';
import { DURATION, FPS, H, W, drawReelFrame } from '../src/lib/reelRender.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PRINTS = join(root, 'app-react', 'public', 'landing', 'img', 'app');
const OUT = join(root, 'app-react', 'public', 'landing', 'img', 'marketing');
const SITE = 'https://eafit.com.br';
const TAGS = '#personaltrainer #treino #appdetreino #academia #musculacao';

const REELS = [
  {
    key: 'treino', print: 'treino', hook: 'Ainda monta treino em planilha?', title: 'Treino pronto em segundos', sub: 'Monte, envie e acompanhe.',
    caption: `Planilha, PDF, WhatsApp… dá para parar. 📲\nMonte o treino no app e ele chega direto no celular do aluno.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'evolucao', print: 'evolucao', hook: 'Seu aluno enxerga a própria evolução?', title: 'Quem vê a evolução não desiste', sub: 'Cada carga vira progresso.',
    caption: `Aluno que não vê resultado, desiste. 💔\nNo app, cada carga e cada série viram evolução visível.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'ao-vivo', print: 'ao-vivo', hook: 'Chega de anotar série no papel', title: 'Registre cada série na hora', sub: 'Treino ao vivo, sem papel.',
    caption: `Registrou, está no histórico. 💪\nO treino ao vivo guarda carga e repetição de cada série.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'nutricao', print: 'nutricao', hook: 'Treino e dieta em apps diferentes?', title: 'Tudo no mesmo app', sub: 'Treino, calorias e macros juntos.',
    caption: `Resultado vem do treino e da comida. 🍽️\nO aluno acompanha as duas coisas num só lugar.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  // Segunda leva (migration 20270101010000): temas novos, legendas diferentes das do feed.
  {
    key: 'historico', later: true, print: 'historico', hook: 'Qual foi a carga do aluno semana passada?', title: 'Todo o histórico num só lugar', sub: 'Treinos, cargas e datas sempre à mão.',
    caption: `Esqueceu a carga do último treino? 🧠
No histórico do app, cada treino fica salvo com data, carga e repetições.

Comece agora. Link na bio 👇

${TAGS}`,
  },
  {
    key: 'agua', later: true, print: 'agua', hook: 'Seu aluno bebe água o suficiente?', title: 'Meta de água em dia', sub: 'Um hábito simples que muda o treino.',
    caption: `Treinar desidratado rende menos. 💧
O app registra a meta diária de água do aluno.

Comece agora. Link na bio 👇

${TAGS}`,
  },
];

async function render(reel) {
  const img = await loadImage(readFileSync(join(PRINTS, `${reel.print}.webp`)));
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const file = join(OUT, `reel-${reel.key}.mp4`);
  const audio = join(tmpdir(), 'eafit-reel-trilha.wav');
  writeFileSync(audio, makeWav(DURATION)); // trilha original sintetizada
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
    '-i', audio,
    '-t', String(DURATION), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-preset', 'medium', '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', file,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) => {
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg saiu com ${code}`))));
    ff.on('error', reject);
  });
  ff.stdin.on('error', () => {});
  for (let i = 0; i < DURATION * FPS; i += 1) {
    drawReelFrame(ctx, reel, img, i / FPS);
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
