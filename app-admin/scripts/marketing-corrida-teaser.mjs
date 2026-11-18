// Pré-lançamento do módulo Corrida (EAFIT Run): material "Em breve" para criar desejo
// ANTES de o admin liberar o módulo para todos. Não diz que já dá para usar: a chamada é
// "em breve / fique de olho". Depois da liberação, vale o material de lançamento
// (marketing-corrida-launch.mjs).
//
//   node app-admin/scripts/marketing-corrida-teaser.mjs
//
// Gera em app-react/public/landing/img/marketing/ (embreve-corrida-*) e o SQL da fila em
// supabase/migrations/20270227000000_marketing_corrida_embreve.sql.txt. Precisa do ffmpeg.
import { loadImage } from '@napi-rs/canvas';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeWav } from './marketing-reels-audio.mjs';
import { printArt, slideArt } from './marketing-autopost-content.mjs';
import { audioPlan, renderVideo, SHIFTS } from './marketing-corrida-launch.mjs';
import { DURATION, STORY_DROP, STORY_DURATION, drawReelFrame, drawStoryFrame } from '../src/lib/reelRender.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PRINTS = join(root, 'app-react', 'public', 'landing', 'img', 'app');
const OUT = join(root, 'app-react', 'public', 'landing', 'img', 'marketing');
const SITE = 'https://eafit.com.br';
const TAGS = '#corrida #corridaderua #running #embreve #EAFIT';
const CTA = 'Fique de olho: em breve no EAFIT. 👀';
const FOOTER = 'Em breve · eafit.com.br';

const FEED = [
  {
    key: 'embreve-corrida-vem-ai', print: 'run-inicio', headline: 'Vem aí o EAFIT Run', sub: 'Corrida com mapa, ritmo e amigos. Em breve no app.',
    caption: `Você corre? Vem novidade aí. 🏃\nO EAFIT Run chega em breve: cada corrida com mapa, ritmo e aplausos dos amigos.\n\n${CTA}\nSalve este post para não perder o lançamento.\n\n${TAGS}`,
  },
  {
    key: 'embreve-corrida-mapa', print: 'run-ao-vivo', headline: 'Sua próxima corrida vai ter mapa', sub: 'Tempo, ritmo e cada km na palma da mão. Em breve.',
    caption: `Imagine saber o tempo de cada quilômetro sem olhar o relógio. 📍\nGPS, voz a cada km e o resumo da corrida, tudo no app. Em breve.\n\n${CTA}\n\n${TAGS}`,
  },
  {
    key: 'embreve-corrida-ranking', print: 'run-desafios', headline: 'Quem corre mais na sua turma?', sub: 'Desafios do mês e km da semana entre amigos. Em breve.',
    caption: `Já separou o amigo que vai topar o desafio? 🏅\nEm breve: desafios de corrida todo mês e ranking de km da semana entre amigos.\n\n${CTA}\nMarque quem vai correr com você.\n\n${TAGS}`,
  },
];

const CAROUSELS = [
  {
    key: 'embreve-corrida-imagine', headline: 'Imagine o seu próximo domingo de corrida',
    slides: [
      ['1', 'Você sai para correr e o app grava o percurso'],
      ['2', 'A cada km, uma voz conta o seu tempo'],
      ['3', 'No fim: mapa, ritmo e recordes na tela'],
      ['4', 'E os amigos aplaudem a sua corrida'],
    ],
    closing: 'EAFIT Run: em breve no app.',
    caption: `Já imaginou? 🏃\nO EAFIT Run chega em breve para quem corre ou quer começar a correr.\n\n${CTA}\nSalve e mande para o seu parceiro de corrida.\n\n${TAGS}`,
  },
  {
    key: 'embreve-corrida-plano', headline: 'E se o seu 5K tivesse um plano?',
    slides: [
      ['1', 'Escolha o objetivo: 5K, 10K ou meia maratona'],
      ['2', 'O app diz qual corrida fazer em cada dia'],
      ['3', 'Cada corrida vira mapa, ritmo e recorde'],
      ['4', 'Desafios do mês para manter a constância'],
    ],
    closing: 'Programa de corrida: em breve.',
    caption: `Começar a correr fica mais fácil com um plano. 👟\nEm breve no EAFIT: programa de 5K, 10K e meia maratona, com o treino de cada dia.\n\n${CTA}\n\n${TAGS}`,
  },
];

// [chave, título, subtítulo, print, variante visual]
const STORIES = [
  ['embreve-corrida-vem-ai', 'Vem aí o EAFIT Run', 'Corrida com mapa, ritmo e amigos.', 'run-inicio', 1],
  ['embreve-corrida-5k', 'Qual vai ser o seu primeiro 5K?', 'O programa de corrida chega em breve.', 'run-ao-vivo', 3],
  ['embreve-corrida-turma', 'Quem corre mais na sua turma?', 'Ranking de km entre amigos. Em breve.', 'run-desafios', 5],
];

const REELS = [
  {
    key: 'embreve-corrida-vem-ai', print: 'run-inicio', hook: 'Você corre? Vem novidade aí.', title: 'EAFIT Run', sub: 'Mapa, ritmo e amigos na sua corrida.',
    ctaTitle: 'Em breve', ctaSub: 'Fique de olho no app',
    caption: `Corrida, mapa e amigos no mesmo app. 🏃\nO EAFIT Run chega em breve.\n\n${CTA}\n\n${TAGS}`,
  },
  {
    key: 'embreve-corrida-plano', print: 'run-ao-vivo', hook: 'E se o seu 5K tivesse um plano?', title: 'Programa de corrida no app', sub: 'Em breve: 5K, 10K e meia maratona.',
    ctaTitle: 'Em breve', ctaSub: 'Fique de olho no app',
    caption: `Primeiros 5 km sem improviso. 👟\nEm breve o app monta as semanas de corrida para você.\n\n${CTA}\n\n${TAGS}`,
  },
];

const sqlText = (s) => `'${s.replace(/'/g, "''")}'`;
const imgs = (files) => JSON.stringify(files.map((f) => ({ type: 'image', url: `${SITE}/img/marketing/${f}` })));
const vid = (file) => JSON.stringify([{ type: 'video', url: `${SITE}/img/marketing/${file}` }]);

async function main() {
  mkdirSync(OUT, { recursive: true });
  const rows = {};
  for (const item of FEED) {
    writeFileSync(join(OUT, `${item.key}-feed.jpg`), await printArt(item, 'feed', FOOTER));
    writeFileSync(join(OUT, `${item.key}-story.jpg`), await printArt(item, 'story', FOOTER));
    rows[item.key] = { key: `${item.key}-feed`, format: 'feed', caption: item.caption, media: imgs([`${item.key}-feed.jpg`]) };
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
    writeFileSync(join(OUT, last), await printArt({ headline: c.closing, sub: 'Fique de olho. Link na bio.', print: 'run-inicio' }, 'feed', FOOTER));
    files.push(last);
    rows[c.key] = { key: `${c.key}-feed`, format: 'feed', caption: c.caption, media: imgs(files) };
  }
  const plan = await audioPlan(3); // trechos diferentes dos do lançamento
  for (const [i, [key, title, sub, print, variant]] of STORIES.entries()) {
    const audio = plan.story(i) || join(tmpdir(), `eafit-story-corrida-v${variant}.wav`);
    if (typeof audio === 'string') writeFileSync(audio, makeWav(STORY_DURATION, { style: 'run', bpm: 128, sweeps: [STORY_DROP], shift: SHIFTS[variant % 6] }));
    const img = await loadImage(readFileSync(join(PRINTS, `${print}.webp`)));
    const story = { pill: 'EM BREVE', title, sub, variant, cta: 'EM BREVE · FIQUE DE OLHO' };
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

  // Ordem: aquece (vem aí) → mostra (mapa, plano) → engaja (ranking, amigos).
  const items = [
    rows['embreve-corrida-vem-ai'],
    { key: 'embreve-corrida-vem-ai-story', format: 'story', caption: '', media: vid('story-embreve-corrida-vem-ai.mp4') },
    { key: 'embreve-corrida-vem-ai-reel', format: 'reel', caption: REELS[0].caption, media: vid('reel-embreve-corrida-vem-ai.mp4') },
    rows['embreve-corrida-imagine'],
    rows['embreve-corrida-mapa'],
    { key: 'embreve-corrida-5k-story', format: 'story', caption: '', media: vid('story-embreve-corrida-5k.mp4') },
    rows['embreve-corrida-plano'],
    { key: 'embreve-corrida-plano-reel', format: 'reel', caption: REELS[1].caption, media: vid('reel-embreve-corrida-plano.mp4') },
    rows['embreve-corrida-ranking'],
    { key: 'embreve-corrida-turma-story', format: 'story', caption: '', media: vid('story-embreve-corrida-turma.mp4') },
  ];
  const values = items.map((it, i) => `  (${i + 1}, ${sqlText(it.key)}, ${sqlText(it.format)}, ${sqlText(it.caption)}, ${sqlText(it.media)})`);
  writeFileSync(join(root, 'supabase', 'migrations', '20270227000000_marketing_corrida_embreve.sql.txt'), `-- Itens da fila do autopost: pré-lançamento do módulo Corrida ("em breve").
-- Gerado por app-admin/scripts/marketing-corrida-teaser.mjs. Aplicar ANTES de liberar o módulo e
-- pular o que sobrar na fila quando o admin liberar (depois valem os itens de lançamento).
insert into public.marketing_autopost_queue (position, key, format, caption, media)
select (select coalesce(max(position), 0) from public.marketing_autopost_queue) + v.n, v.key, v.format, v.caption, v.media::jsonb
from (values
${values.join(',\n')}
) as v(n, key, format, caption, media);
`);
  console.log(`${items.length} itens na fila (SQL gerado)`);
}

main();
