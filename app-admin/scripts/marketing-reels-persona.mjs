// Reels com personagem (uma mulher e um homem, ilustrados, com a marca EAFIT):
// falam a chamada com legenda, usam o app e fecham com o link da bio.
//
//   node app-admin/scripts/marketing-reels-persona.mjs
//
// Precisa do ffmpeg no PATH. Gera reel-ela.mp4 e reel-ele.mp4 em
// app-react/public/landing/img/marketing/ e o SQL dos itens em
// supabase/migrations/20270105010000_marketing_persona_reels.items.sql.txt.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeWav } from './marketing-reels-audio.mjs';
import { FPS, H, W } from '../src/lib/reelRender.js';
import { PERSONA_DURATION, drawPersonaFrame } from '../src/lib/reelPersona.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PRINTS = join(root, 'app-react', 'public', 'landing', 'img', 'app');
const OUT = join(root, 'app-react', 'public', 'landing', 'img', 'marketing');
const SITE = 'https://eafit.com.br';
const TAGS = '#personaltrainer #treino #appdetreino #academia #musculacao';

const REELS = [
  {
    key: 'ela', who: 'woman', print: 'treino', style: 'bright',
    line1: 'Personal, você ainda monta treino na planilha?',
    line2: 'Monte o treino no app e ele chega direto no celular do aluno.',
    caption: `Planilha, PDF, WhatsApp… dá para simplificar. 👩‍🏫📲\nMonte o treino no app EAFIT e envie direto para o celular do aluno.\n\nLink na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'ele', who: 'man', print: 'evolucao', style: 'energy',
    line1: 'Seu aluno enxerga a própria evolução?',
    line2: 'No app, cada carga e cada série viram evolução visível.',
    caption: `Aluno que vê o progresso não desiste. 💪📈\nNo app EAFIT, cada carga e cada série viram evolução visível.\n\nLink na bio 👇\n\n${TAGS}`,
  },
];

async function render(reel) {
  const img = await loadImage(readFileSync(join(PRINTS, `${reel.print}.webp`)));
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const audio = join(tmpdir(), `eafit-persona-${reel.style}.wav`);
  writeFileSync(audio, makeWav(PERSONA_DURATION, { style: reel.style }));
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
    '-i', audio,
    '-t', String(PERSONA_DURATION), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'medium', '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', join(OUT, `reel-${reel.key}.mp4`),
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) => {
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg saiu com ${code}`))));
    ff.on('error', reject);
  });
  ff.stdin.on('error', () => {});
  for (let i = 0; i < PERSONA_DURATION * FPS; i += 1) {
    drawPersonaFrame(ctx, reel, img, i / FPS);
    const rgba = Buffer.from(ctx.getImageData(0, 0, W, H).data.buffer);
    if (!ff.stdin.write(rgba)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await done;
}

const sqlText = (s) => `'${s.replace(/'/g, "''")}'`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const rows = [];
  for (const [n, reel] of REELS.entries()) {
    await render(reel);
    const media = JSON.stringify([{ type: 'video', url: `${SITE}/img/marketing/reel-${reel.key}.mp4` }]);
    rows.push(`  (${sqlText(`persona-${reel.key}-reel`)}, ${n}, ${sqlText(reel.caption)}, ${sqlText(media)}::jsonb)`);
    console.log('ok', reel.key);
  }
  writeFileSync(
    join(root, 'supabase', 'migrations', '20270105010000_marketing_persona_reels.items.sql.txt'),
    `${rows.join(',\n')}\n`,
  );
}

main();
