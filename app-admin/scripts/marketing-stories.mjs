// Stories em vídeo da publicação automática do Marketing, com música:
//   - nutrição, nos horários das refeições (café, almoço, jantar, ceia), 4 de cada;
//   - os 6 stories gerais (19h), que antes eram só imagem, agora em vídeo.
// Feitos só com os prints do app e a trilha original (src/lib/reelAudio.js).
//
//   node app-admin/scripts/marketing-stories.mjs            (todos)
//   ONLY=nutri node app-admin/scripts/marketing-stories.mjs (só um grupo: nutri | geral)
//
// Precisa do ffmpeg no PATH. Gera os MP4 em app-react/public/landing/img/marketing/
// (story-*.mp4) e o SQL dos itens em
// supabase/migrations/20270104010000_marketing_story_slots.items.sql.txt (colado na migration).
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeWav } from './marketing-reels-audio.mjs';
import { FPS, H, STORY_DURATION, W, drawStoryFrame } from '../src/lib/reelRender.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PRINTS = join(root, 'app-react', 'public', 'landing', 'img', 'app');
const OUT = join(root, 'app-react', 'public', 'landing', 'img', 'marketing');
const SITE = 'https://eafit.com.br';

// Stories de nutrição por refeição. style: bright (manhã e meio-dia) ou calm (noite).
const MEALS = {
  cafe: {
    pill: 'CAFÉ DA MANHÃ', style: 'bright', label: 'café da manhã',
    items: [
      ['Já registrou o seu café da manhã?', 'Anote em segundos no app.', 'nutricao-diario'],
      ['Comece o dia com a meta em mente', 'Veja calorias e macros desde a primeira refeição.', 'nutricao'],
      ['Café tomado, água também?', 'Registre o primeiro copo do dia.', 'agua'],
      ['Diário de nutrição sem complicação', 'Café da manhã registrado em um toque.', 'nutricao-diario'],
    ],
  },
  almoco: {
    pill: 'ALMOÇO', style: 'bright', label: 'almoço',
    items: [
      ['Almoçou? Registre agora', 'Calorias e macros sem complicação.', 'nutricao'],
      ['Quanto falta para a sua meta?', 'Confira como está o dia na hora do almoço.', 'nutricao-diario'],
      ['Almoço e hidratação', 'Não esqueça da água entre as refeições.', 'agua'],
      ['Prato feito, diário em dia', 'Registre o almoço antes de esquecer.', 'nutricao-diario'],
    ],
  },
  jantar: {
    pill: 'JANTAR', style: 'calm', label: 'jantar',
    items: [
      ['Fechando o dia com o jantar', 'Veja quanto falta para a meta.', 'nutricao'],
      ['Jantar registrado, dia completo', 'O diário mostra o resumo do dia.', 'nutricao-diario'],
      ['Já bateu a meta de água hoje?', 'Confira antes de encerrar o dia.', 'agua'],
      ['Treino e jantar no mesmo app', 'Evolução e alimentação juntas.', 'nutricao'],
    ],
  },
  ceia: {
    pill: 'CEIA', style: 'calm', label: 'ceia',
    items: [
      ['Ceia também conta', 'Registre e feche o diário do dia.', 'nutricao-diario'],
      ['Antes de dormir: diário em dia?', 'Um minuto para revisar o dia.', 'nutricao'],
      ['Hidratação até o fim do dia', 'Veja se a meta de água foi atingida.', 'agua'],
      ['Amanhã tem treino', 'Feche o dia e comece com tudo.', 'nutricao-diario'],
    ],
  },
};

// Stories gerais (19h): mesmos títulos das artes de imagem que já estão na fila.
const GENERAL = [
  ['treino', 'Treino pronto em segundos', 'Monte, envie e acompanhe.', 'treino'],
  ['evolucao', 'Quem vê a evolução não desiste', 'Cada carga e cada série viram progresso.', 'evolucao'],
  ['ao-vivo', 'Registre cada série na hora', 'Treino ao vivo, sem papel.', 'ao-vivo'],
  ['historico', 'Todo o histórico num só lugar', 'Treinos, cargas e datas sempre à mão.', 'historico'],
  ['nutricao', 'Treino e alimentação juntos', 'Calorias e macros no mesmo app.', 'nutricao'],
  ['agua', 'Meta de água em dia', 'Um hábito simples que muda o treino.', 'agua'],
];

async function render(file, story, print, style) {
  const img = await loadImage(readFileSync(join(PRINTS, `${print}.webp`)));
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const audio = join(tmpdir(), `eafit-story-${style}.wav`);
  writeFileSync(audio, makeWav(STORY_DURATION, { style, sweeps: [1.2] }));
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
    '-i', audio,
    '-t', String(STORY_DURATION), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-preset', 'medium', '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', join(OUT, file),
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) => {
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg saiu com ${code}`))));
    ff.on('error', reject);
  });
  ff.stdin.on('error', () => {});
  for (let i = 0; i < STORY_DURATION * FPS; i += 1) {
    drawStoryFrame(ctx, story, img, i / FPS);
    const rgba = Buffer.from(ctx.getImageData(0, 0, W, H).data.buffer);
    if (!ff.stdin.write(rgba)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await done;
}

const sqlText = (s) => `'${s.replace(/'/g, "''")}'`;
const mediaOf = (file) => JSON.stringify([{ type: 'video', url: `${SITE}/img/marketing/${file}` }]);

async function main() {
  mkdirSync(OUT, { recursive: true });
  const only = process.env.ONLY;
  const rows = [];
  const updates = [];
  let position = 22; // depois dos 22 itens que já estão na fila

  if (only !== 'geral') {
    for (let n = 0; n < 4; n += 1) {
      for (const [slot, meal] of Object.entries(MEALS)) {
        const [title, sub, print] = meal.items[n];
        const file = `story-${slot}-${n + 1}.mp4`;
        await render(file, { pill: meal.pill, title, sub }, print, meal.style);
        position += 1;
        rows.push(`  (${position}, ${sqlText(`nutri-${slot}-${n + 1}`)}, 'story', ${sqlText(slot)}, '', ${sqlText(mediaOf(file))}::jsonb)`);
        console.log('ok', file);
      }
    }
  }
  if (only !== 'nutri') {
    for (const [key, title, sub, print] of GENERAL) {
      const file = `story-${key}.mp4`;
      await render(file, { title, sub }, print, 'energy');
      updates.push(`update public.marketing_autopost_queue set media = ${sqlText(mediaOf(file))}::jsonb where key = ${sqlText(`${key}-story`)} and posted_at is null;`);
      console.log('ok', file);
    }
  }
  writeFileSync(
    join(root, 'supabase', 'migrations', '20270104010000_marketing_story_slots.items.sql.txt'),
    `${rows.length ? `insert into public.marketing_autopost_queue (position, key, format, slot, caption, media) values\n${rows.join(',\n')};\n` : ''}${updates.join('\n')}\n`,
  );
}

main();
