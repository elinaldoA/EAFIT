// Regera só os vídeos "Em breve" do Run que ainda NÃO saíram, com o convite para a lista de espera
// escrito na imagem (stories não têm legenda nem adesivo de link pela API, então o endereço vai no vídeo).
// Mantém o nome de cada arquivo e a mesma trilha de cada peça: a fila (marketing_autopost_queue) não muda.
//
//   node app-admin/scripts/marketing-corrida-lista-espera.mjs        (precisa do ffmpeg no PATH)
//   ONLY=story-embreve-corrida-tenis node app-admin/scripts/marketing-corrida-lista-espera.mjs   (um arquivo)
//
// Não mexe nas peças já publicadas nem nas de lançamento. Se uma peça nova entrar na campanha, os
// geradores marketing-corrida-{educativo,embreve2,teaser}.mjs já saem com o mesmo texto.
import { loadImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeWav } from './marketing-reels-audio.mjs';
import { SHIFTS, audioPlan, renderVideo } from './marketing-corrida-launch.mjs';
import { STORIES as EDU_STORIES, REELS as EDU_REELS } from './marketing-corrida-educativo.mjs';
import { STORIES as EMBREVE2_STORIES, REEL as EMBREVE2_REEL } from './marketing-corrida-embreve2.mjs';
import { DURATION, STORY_DROP, STORY_DURATION, drawReelFrame, drawStoryFrame } from '../src/lib/reelRender.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PRINTS = join(root, 'app-react', 'public', 'landing', 'img', 'app');

const URL_SHOWN = 'eafit.com.br/corrida';
const STORY_CTA = 'ENTRE NA LISTA DE ESPERA';

// 'Quem corre mais na sua turma?' vem do marketing-corrida-teaser.mjs, que roda sozinho ao ser importado.
const TEASER_STORIES = [
  ['embreve-corrida-turma', 'Quem corre mais na sua turma?', 'Ranking de km entre amigos. Em breve.', 'run-desafios', 5],
];

// [lista de origem, deslocamento da trilha (audioPlan) da origem, histórias pendentes (chaves)]
const GROUPS = [
  { stories: EDU_STORIES, offset: 3, tag: 'corrida-edu', pending: ['corrida-edu-mitos', 'corrida-edu-aquecimento', 'corrida-edu-provas'] },
  {
    stories: EMBREVE2_STORIES, offset: 5, tag: 'embreve2',
    pending: ['embreve-corrida-provas', 'embreve-corrida-sua-prova', 'embreve-corrida-cartao', 'embreve-corrida-tenis', 'embreve-corrida-clima', 'embreve-corrida-semana'],
  },
  { stories: TEASER_STORIES, offset: 3, base: 2, tag: 'corrida', pending: ['embreve-corrida-turma'] }, // 3º story do teaser (índice 2)
];

const PENDING_REELS = [
  { reel: EDU_REELS.find((r) => r.key === 'corrida-edu-mitos'), offset: 3, index: 0, tag: 'corrida-edu' },
  { reel: EDU_REELS.find((r) => r.key === 'corrida-edu-forca'), offset: 3, index: 1, tag: 'corrida-edu' },
  { reel: EDU_REELS.find((r) => r.key === 'corrida-edu-primeira-prova'), offset: 3, index: 2, tag: 'corrida-edu' },
  { reel: EMBREVE2_REEL, offset: 5, index: 0, tag: 'embreve2' },
];

const only = process.env.ONLY || '';
const wanted = (file) => !only || only === file || only === file.replace(/.mp4$/, '');

async function main() {
  for (const g of GROUPS) {
    const plan = await audioPlan(g.offset);
    for (const [i, [key, title, sub, print, variant]] of g.stories.entries()) {
      const file = `story-${key}.mp4`;
      if (!g.pending.includes(key) || !wanted(file)) continue;
      const audio = plan.story(i + (g.base || 0)) || join(tmpdir(), `eafit-story-${g.tag}-v${variant}.wav`);
      if (typeof audio === 'string') writeFileSync(audio, makeWav(STORY_DURATION, { style: 'run', bpm: 128, sweeps: [STORY_DROP], shift: SHIFTS[variant % 6] }));
      const img = await loadImage(readFileSync(join(PRINTS, `${print}.webp`)));
      const story = { pill: 'EM BREVE', title, sub, variant, cta: STORY_CTA, url: URL_SHOWN };
      await renderVideo(file, STORY_DURATION, audio, (ctx, im, t) => drawStoryFrame(ctx, story, im, t), img);
      console.log('ok', file);
    }
  }
  const plans = new Map();
  for (const { reel, offset, index, tag } of PENDING_REELS) {
    const file = `reel-${reel.key}.mp4`;
    if (!wanted(file)) continue;
    if (!plans.has(offset)) plans.set(offset, await audioPlan(offset));
    const wav = join(tmpdir(), `eafit-reel-${tag}.wav`);
    writeFileSync(wav, makeWav(DURATION, { style: 'run', bpm: 140, sweeps: [3.4, 9.6] }));
    const audio = plans.get(offset).reel(index) || wav;
    const img = await loadImage(readFileSync(join(PRINTS, `${reel.print}.webp`)));
    const withCta = { ...reel, ctaTitle: 'Lista de espera', ctaSub: 'Entre e seja avisado', url: URL_SHOWN };
    await renderVideo(file, DURATION, audio, (ctx, im, t) => drawReelFrame(ctx, withCta, im, t), img);
    console.log('ok', file);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
