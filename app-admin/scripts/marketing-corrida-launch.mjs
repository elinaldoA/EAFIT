// Material de lançamento do módulo Corrida (EAFIT Run) para o Marketing:
//   - 3 artes de feed + 3 de story (prints run-inicio, run-ao-vivo, run-desafios);
//   - 2 carrosséis de texto (motivos para correr com o app; do zero aos 5 km);
//   - 3 stories em vídeo (8 s) e 3 Reels (12 s), com a trilha original;
//   - o SQL dos itens da fila do autopost (.sql.txt, para virar migration quando o
//     módulo for liberado) e o kit de legendas dos embaixadores (marketing/).
//
//   node app-admin/scripts/marketing-corrida-launch.mjs
//   ONLY=imagens node app-admin/scripts/marketing-corrida-launch.mjs   (sem vídeos; também: videos)
//
// Os vídeos precisam do ffmpeg no PATH. Saída em app-react/public/landing/img/marketing/
// (corrida-*.jpg, story-corrida-*.mp4, reel-corrida-*.mp4).
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeWav } from './marketing-reels-audio.mjs';
import { SONG, strongOnsets } from './marketing-stories.mjs';
import { printArt, slideArt } from './marketing-autopost-content.mjs';
import {
  DURATION, FPS, H, STORY_DROP, STORY_DURATION, W, drawReelFrame, drawStoryFrame,
} from '../src/lib/reelRender.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PRINTS = join(root, 'app-react', 'public', 'landing', 'img', 'app');
const OUT = join(root, 'app-react', 'public', 'landing', 'img', 'marketing');
const SITE = 'https://eafit.com.br';
const TAGS = '#corrida #corridaderua #running #treino #EAFIT';
const CTA = 'Comece agora. Link na bio 👇';

// Ordem de publicação sugerida (a fila segue esta ordem).
const FEED_PRINTS = [
  {
    key: 'corrida-inicio', print: 'run-inicio', headline: 'Chegou o EAFIT Run', sub: 'Suas corridas com mapa, ritmo e aplausos dos amigos.',
    caption: `Chegou o EAFIT Run. 🏃\nGrave a corrida com GPS, veja o mapa, o ritmo e o tempo e receba aplausos de quem corre com você.\n\n${CTA}\n\n${TAGS}`,
  },
  {
    key: 'corrida-ao-vivo', print: 'run-ao-vivo', headline: 'Corra com GPS e voz a cada km', sub: 'Tempo, distância e ritmo por km, ao vivo.',
    caption: `Corrida gravada enquanto você corre. 📍\nO app mostra tempo, distância, ritmo e o tempo de cada quilômetro, e pode avisar por voz a cada km.\n\n${CTA}\n\n${TAGS}`,
  },
  {
    key: 'corrida-desafios', print: 'run-desafios', headline: 'Desafios de corrida todo mês', sub: 'Km do mês, corridas na semana e ranking entre amigos.',
    caption: `Todo mês um desafio novo. 🏅\nCorra os km do mês, feche as corridas da semana e dispute o ranking de km com os amigos.\n\n${CTA}\n\n${TAGS}`,
  },
];

const CAROUSELS = [
  {
    key: 'corrida-motivos', headline: 'Correr com o EAFIT Run: 5 motivos',
    slides: [
      ['1', 'GPS com mapa, ritmo e tempo de cada corrida'],
      ['2', 'Voz que avisa a cada quilômetro'],
      ['3', 'Programa de 5K, 10K ou meia maratona'],
      ['4', 'Desafios do mês e ranking de km entre amigos'],
      ['5', 'Recordes e histórico de todas as corridas'],
    ],
    closing: 'Comece a correr com o EAFIT Run.',
    caption: `Cinco motivos para gravar a sua próxima corrida no EAFIT Run. 🏃\nSalve este post e mande para o seu parceiro de corrida.\n\n${CTA}\n\n${TAGS}`,
  },
  {
    key: 'corrida-5k', headline: 'Do zero aos 5 km: por onde começar',
    slides: [
      ['1', 'Alterne corrida e caminhada nas primeiras semanas'],
      ['2', 'Corra num ritmo em que dá para conversar'],
      ['3', 'Três corridas por semana, com descanso entre elas'],
      ['4', 'Aumente o volume aos poucos, sem pressa'],
    ],
    closing: 'O app monta o seu programa de 5K.',
    caption: `Começar a correr não precisa ser difícil. 👟\nSalve estes passos e comece do seu jeito. No EAFIT Run, o programa de 5K diz qual corrida fazer em cada dia.\n\n${CTA}\n\n${TAGS}`,
  },
];

// [chave, título, subtítulo, print, variante visual]
const STORIES = [
  ['corrida-lancamento', 'Chegou o EAFIT Run', 'Corrida com GPS, mapa e amigos.', 'run-inicio', 0],
  ['corrida-ao-vivo', 'Corra e acompanhe ao vivo', 'Tempo, distância e ritmo por km.', 'run-ao-vivo', 2],
  ['corrida-desafios', 'Qual é o seu desafio do mês?', 'Km, corridas e ranking entre amigos.', 'run-desafios', 4],
];

const REELS = [
  {
    key: 'corrida-lancamento', print: 'run-inicio', hook: 'Quer começar a correr?', title: 'Chegou o EAFIT Run', sub: 'GPS, mapa e aplausos dos amigos.',
    caption: `Corrida, mapa e amigos no mesmo app. 🏃\nO EAFIT Run grava o seu percurso e mostra o ritmo de cada quilômetro.\n\n${CTA}\n\n${TAGS}`,
  },
  {
    key: 'corrida-5k', print: 'run-ao-vivo', hook: 'Quer correr os seus primeiros 5 km?', title: 'Programa de 5K no app', sub: 'O app diz qual corrida fazer em cada dia.',
    caption: `Primeiros 5 km sem improviso. 👟\nEscolha o objetivo e o seu nível e o app monta as semanas, com corrida, descanso e força para corredor.\n\n${CTA}\n\n${TAGS}`,
  },
  {
    key: 'corrida-amigos', print: 'run-desafios', hook: 'Correr acompanhado dá mais vontade', title: 'Desafios entre amigos', sub: 'Km da semana e desafios do mês.',
    caption: `Com amigo junto, fica mais difícil faltar. 👊\nAdicione os amigos pelo código, veja as corridas deles e dispute os km da semana.\n\n${CTA}\n\n${TAGS}`,
  },
];

// `audio`: caminho de um WAV ou { song, start } (trecho do song.mp3, com volume normalizado).
export async function renderVideo(file, seconds, audio, drawFrame, img) {
  const song = typeof audio === 'object';
  const audioIn = song ? ['-ss', audio.start.toFixed(3), '-t', String(seconds), '-i', audio.song] : ['-i', audio];
  const af = song
    ? `loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,afade=t=in:d=0.12,afade=t=out:st=${seconds - 0.8}:d=0.8,apad`
    : 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad';
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
    ...audioIn,
    '-af', af,
    '-t', String(seconds), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-preset', 'medium', '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-movflags', '+faststart', join(OUT, file),
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) => {
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg saiu com ${code}`))));
    ff.on('error', reject);
  });
  ff.stdin.on('error', () => {});
  for (let i = 0; i < seconds * FPS; i += 1) {
    drawFrame(ctx, img, i / FPS);
    const rgba = Buffer.from(ctx.getImageData(0, 0, W, H).data.buffer);
    if (!ff.stdin.write(rgba)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await done;
}

// Trilha: faixas de app-admin/music (fora do git). Usa song-3.mp3 e corrida-*.mp3 (ex.: corrida-1.mp3 e
// corrida-2.mp3, do Pixabay), alternando entre elas a cada vídeo; sem elas, o song.mp3.
// Cada vídeo pega um trecho diferente, com uma batida forte na entrada do print (story) ou na
// troca de cena (Reel). SONG_OFF=1 usa a trilha sintetizada.
export async function audioPlan(offset = 0) {
  const dir = dirname(SONG);
  const songs = existsSync(dir) ? readdirSync(dir).filter((f) => /^(corrida-.*|song-3)\.mp3$/i.test(f)).sort().map((f) => join(dir, f)) : [];
  if (!songs.length && existsSync(SONG)) songs.push(SONG);
  if (process.env.SONG_OFF === '1' || !songs.length) {
    console.log('Trilha sintetizada (sem mp3)');
    return { story: () => null, reel: () => null };
  }
  console.log(`Trilha: ${songs.join(', ')}`);
  const st = [];
  const rl = [];
  for (const song of songs) {
    st.push((await strongOnsets(song, 24, STORY_DROP, STORY_DURATION)).map((start) => ({ song, start })));
    rl.push((await strongOnsets(song, 24, 3.4, DURATION)).map((start) => ({ song, start })));
  }
  const pick = (lists, i) => lists[i % lists.length][Math.floor((i + offset) / lists.length) % lists[0].length];
  return { story: (i) => pick(st, i + offset), reel: (i) => pick(rl, i + offset) };
}

export const SHIFTS = [0, 2, 3, 5, 7, -2];
const sqlText = (s) => `'${s.replace(/'/g, "''")}'`;
const mediaImg = (files) => JSON.stringify(files.map((f) => ({ type: 'image', url: `${SITE}/img/marketing/${f}` })));
const mediaVid = (file) => JSON.stringify([{ type: 'video', url: `${SITE}/img/marketing/${file}` }]);

async function images() {
  const rows = {};
  for (const item of FEED_PRINTS) {
    writeFileSync(join(OUT, `${item.key}-feed.jpg`), await printArt(item, 'feed'));
    writeFileSync(join(OUT, `${item.key}-story.jpg`), await printArt(item, 'story'));
    rows[item.key] = [{ key: `${item.key}-feed`, format: 'feed', caption: item.caption, media: mediaImg([`${item.key}-feed.jpg`]) }];
  }
  for (const c of CAROUSELS) {
    const files = [`${c.key}-1.jpg`];
    writeFileSync(join(OUT, files[0]), slideArt(c.headline, { big: true, small: 'Deslize →' }));
    c.slides.forEach(([n, text], i) => {
      const f = `${c.key}-${i + 2}.jpg`;
      writeFileSync(join(OUT, f), slideArt(text, { number: n }));
      files.push(f);
    });
    const last = `${c.key}-${c.slides.length + 2}.jpg`;
    writeFileSync(join(OUT, last), await printArt({ headline: c.closing, sub: 'Comece agora. Link na bio.', print: 'run-inicio' }, 'feed'));
    files.push(last);
    rows[c.key] = [{ key: `${c.key}-feed`, format: 'feed', caption: c.caption, media: mediaImg(files) }];
  }
  return rows;
}

async function videos() {
  const plan = await audioPlan(0);
  for (const [i, [key, title, sub, print, variant]] of STORIES.entries()) {
    const audio = plan.story(i) || join(tmpdir(), `eafit-story-corrida-v${variant}.wav`);
    if (typeof audio === 'string') writeFileSync(audio, makeWav(STORY_DURATION, { style: 'run', bpm: 128, sweeps: [STORY_DROP], shift: SHIFTS[variant % 6] }));
    const img = await loadImage(readFileSync(join(PRINTS, `${print}.webp`)));
    const story = { pill: 'EAFIT RUN', title, sub, variant };
    await renderVideo(`story-${key}.mp4`, STORY_DURATION, audio, (ctx, im, t) => drawStoryFrame(ctx, story, im, t), img);
    console.log('ok', `story-${key}.mp4`);
  }
  const wav = join(tmpdir(), 'eafit-reel-corrida.wav');
  writeFileSync(wav, makeWav(DURATION, { style: 'run', bpm: 140, sweeps: [3.4, 9.6] }));
  for (const [i, reel] of REELS.entries()) {
    const audio = plan.reel(i) || wav;
    const img = await loadImage(readFileSync(join(PRINTS, `${reel.print}.webp`)));
    await renderVideo(`reel-${reel.key}.mp4`, DURATION, audio, (ctx, im, t) => drawReelFrame(ctx, reel, im, t), img);
    console.log('ok', `reel-${reel.key}.mp4`);
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const only = process.env.ONLY;
  const byKey = await images();
  if (only === 'imagens') return writeSql(byKey);
  await videos();
  return writeSql(byKey);
}

// Itens da fila na ordem de publicação: feed → story → Reel do mesmo tema, com os
// carrosséis entre eles. Slot nulo = fila geral (marketing_autopost_run).
function writeSql(byKey) {
  const storyKey = (k) => STORIES.find((s) => s[0] === k);
  const items = [
    ...byKey['corrida-inicio'],
    { key: 'corrida-lancamento-story', format: 'story', caption: '', media: mediaVid('story-corrida-lancamento.mp4') },
    { key: 'corrida-lancamento-reel', format: 'reel', caption: REELS[0].caption, media: mediaVid('reel-corrida-lancamento.mp4') },
    ...byKey['corrida-motivos'],
    ...byKey['corrida-ao-vivo'],
    { key: 'corrida-ao-vivo-story', format: 'story', caption: '', media: mediaVid(`story-${storyKey('corrida-ao-vivo')[0]}.mp4`) },
    { key: 'corrida-5k-reel', format: 'reel', caption: REELS[1].caption, media: mediaVid('reel-corrida-5k.mp4') },
    ...byKey['corrida-5k'],
    ...byKey['corrida-desafios'],
    { key: 'corrida-desafios-story', format: 'story', caption: '', media: mediaVid('story-corrida-desafios.mp4') },
    { key: 'corrida-amigos-reel', format: 'reel', caption: REELS[2].caption, media: mediaVid('reel-corrida-amigos.mp4') },
  ];
  const values = items.map((it, i) => `  (${i + 1}, ${sqlText(it.key)}, ${sqlText(it.format)}, ${sqlText(it.caption)}, ${sqlText(it.media)})`);
  const sql = `-- Itens da fila do autopost: lançamento do módulo Corrida (EAFIT Run).
-- Gerado por app-admin/scripts/marketing-corrida-launch.mjs. NÃO aplicar antes de o
-- módulo estar liberado para todos (Configurações do app > Módulos).
insert into public.marketing_autopost_queue (position, key, format, caption, media)
select (select coalesce(max(position), 0) from public.marketing_autopost_queue) + v.n, v.key, v.format, v.caption, v.media::jsonb
from (values
${values.join(',\n')}
) as v(n, key, format, caption, media);
`;
  writeFileSync(join(root, 'supabase', 'migrations', '20270227010000_marketing_corrida_lancamento.sql.txt'), sql);
  console.log(`${items.length} itens na fila (SQL gerado)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
