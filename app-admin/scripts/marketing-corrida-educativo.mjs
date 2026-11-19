// Conteúdo de manutenção do módulo Corrida (EAFIT Run) depois do lançamento: carrosséis educativos
// e de produto (só imagem, sem ffmpeg).
//
//   node app-admin/scripts/marketing-corrida-educativo.mjs
//
// Saída: app-react/public/landing/img/marketing/corrida-edu-*.jpg e a migration
// supabase/migrations/20270301000000_marketing_corrida_educativo_embreve.sql (reescreve como "Em breve" os
// itens que a migration 20270228010000 pôs na fila: saem com o módulo desligado).
import { loadImage } from '@napi-rs/canvas';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeWav } from './marketing-reels-audio.mjs';
import { printArt, slideArt } from './marketing-autopost-content.mjs';
import { SHIFTS, audioPlan, renderVideo } from './marketing-corrida-launch.mjs';
import { DURATION, STORY_DROP, STORY_DURATION, drawReelFrame, drawStoryFrame } from '../src/lib/reelRender.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(root, 'app-react', 'public', 'landing', 'img', 'marketing');
const SITE = 'https://eafit.com.br';
const TAGS = '#corrida #corridaderua #running #embreve #EAFIT';
const FOOTER = 'Em breve · eafit.com.br';
const CTA = 'Fique de olho: em breve no EAFIT. 👀';

// Cada carrossel: capa, slides numerados e fechamento com o print do app.
export const CAROUSELS = [
  {
    key: 'corrida-edu-mitos', headline: 'Mitos e verdades da corrida',
    slides: [
      ['1', 'Mito: correr estraga o joelho. Com progressão e descanso, o risco cai muito'],
      ['2', 'Verdade: dá para começar caminhando e alternando com trote'],
      ['3', 'Mito: tem que correr todo dia para evoluir'],
      ['4', 'Verdade: o descanso é onde o corpo se adapta ao treino'],
      ['5', 'Mito: quem corre devagar não está treinando'],
      ['6', 'Verdade: a maior parte dos treinos deve ser num ritmo confortável'],
    ],
    closing: 'Em breve: corra com plano no EAFIT Run.',
    caption: `Quantos desses mitos você já ouviu? 🤔\nSalve este post e mande para quem diz que não nasceu para correr. O EAFIT Run chega em breve.\n\n${CTA}\n\n${TAGS}`,
  },
  {
    key: 'corrida-edu-aquecimento', headline: 'Aquecimento antes de correr',
    slides: [
      ['1', 'Comece caminhando de 3 a 5 minutos'],
      ['2', 'Faça círculos com os tornozelos e os quadris'],
      ['3', 'Agachamentos leves e afundos, sem pressa'],
      ['4', 'Trote bem leve nos primeiros minutos da corrida'],
      ['5', 'Só acelere quando o corpo estiver quente'],
    ],
    closing: 'Em breve: registre cada corrida no EAFIT Run.',
    caption: `Cinco minutos de aquecimento mudam a sua corrida. 🔥\nSalve este roteiro e use antes de calçar o tênis. Em breve no EAFIT Run: registre cada corrida.\n\n${CTA}\n\n${TAGS}`,
  },
  {
    key: 'corrida-edu-forca', headline: 'Força para quem corre',
    slides: [
      ['1', 'Agachamento: pernas e glúteos mais fortes a cada passada'],
      ['2', 'Afundo: equilíbrio e estabilidade de cada perna'],
      ['3', 'Panturrilha em pé: apoio mais firme no chão'],
      ['4', 'Prancha: tronco firme segura a postura no fim da prova'],
      ['5', 'Duas vezes por semana já fazem diferença'],
    ],
    closing: 'Em breve: corrida e força no mesmo app.',
    caption: `Quem corre e treina força corre melhor. 💪\nEm breve no EAFIT: programa de corrida com treino de força para corredor.\n\n${CTA}\n\n${TAGS}`,
  },
  {
    key: 'corrida-edu-lesao', headline: 'Como evitar lesão na corrida',
    slides: [
      ['1', 'Aumente o volume aos poucos, semana a semana'],
      ['2', 'Alterne dias de corrida com dias de descanso'],
      ['3', 'Use um tênis adequado e troque quando estiver gasto'],
      ['4', 'Fortaleça pernas e core, não só corra'],
      ['5', 'Dor que persiste é sinal para parar e procurar um profissional'],
    ],
    closing: 'Em breve: evolua com plano no EAFIT Run.',
    caption: `Correr por mais tempo começa por se cuidar. 🩹\nSalve estas dicas para consultar sempre. Em breve no EAFIT Run: programa com plano e descanso.\n\n${CTA}\n\n${TAGS}`,
  },
  {
    key: 'corrida-edu-tenis', headline: 'Como escolher o tênis de corrida',
    slides: [
      ['1', 'Prefira o tênis que é confortável desde o primeiro uso'],
      ['2', 'Experimente no fim do dia, quando o pé está mais inchado'],
      ['3', 'Deixe uma folga na frente para os dedos'],
      ['4', 'Pense no piso em que você mais corre'],
      ['5', 'Controle os km do tênis e troque quando ele estiver gasto'],
    ],
    closing: 'Em breve: acompanhe os seus km no EAFIT Run.',
    caption: `Tênis certo, corrida mais confortável. 👟\nSalve este guia antes da próxima compra. Em breve no EAFIT Run: km de cada tênis.\n\n${CTA}\n\n${TAGS}`,
  },
  {
    key: 'corrida-edu-pre-corrida', headline: 'O que fazer antes de correr',
    slides: [
      ['1', 'Beba água ao longo do dia, não só na hora'],
      ['2', 'Coma algo leve de 1 a 2 horas antes, se sentir necessidade'],
      ['3', 'Evite testar comida ou tênis novos no dia da prova'],
      ['4', 'Separe a roupa e carregue o celular na véspera'],
      ['5', 'Durma bem: a noite anterior vale mais que o treino extra'],
    ],
    closing: 'Em breve: grave a corrida no EAFIT Run.',
    caption: `Preparação simples, corrida melhor. ⏱️\nSalve este checklist para o dia da prova. Em breve no EAFIT Run: grave a corrida.\n\n${CTA}\n\n${TAGS}`,
  },
  {
    key: 'corrida-edu-primeira-prova', headline: 'Sua primeira prova de rua',
    slides: [
      ['1', 'Escolha uma distância que você já corre com folga'],
      ['2', 'Procure uma prova no seu estado, com data para se planejar'],
      ['3', 'Faça o último treino longo uma a duas semanas antes'],
      ['4', 'Não largue rápido: comece mais devagar do que o treino'],
      ['5', 'Curta a prova. A meta é terminar bem'],
    ],
    closing: 'Em breve: as próximas corridas no app.',
    caption: `A primeira prova não precisa dar medo. 🏁\nEm breve o EAFIT Run vai mostrar as próximas corridas do seu estado para você escolher a sua.\n\n${CTA}\n\n${TAGS}`,
  },
];

const PRINTS = join(root, 'app-react', 'public', 'landing', 'img', 'app');

// [chave, título, subtítulo, print, variante visual]
export const STORIES = [
  ['corrida-edu-mitos', 'Mito ou verdade? Correr estraga o joelho', 'Com progressão e descanso, o risco cai.', 'run-inicio', 1],
  ['corrida-edu-aquecimento', 'Aqueça 5 minutos antes de correr', 'Caminhe, mobilize e comece leve.', 'run-ao-vivo', 3],
  ['corrida-edu-provas', 'Quais corridas vão ter perto de você?', 'As provas do seu estado, em breve no app.', 'run-desafios', 5],
];

export const REELS = [
  {
    key: 'corrida-edu-mitos', print: 'run-inicio', hook: 'Você ainda acredita nesses mitos da corrida?', title: 'Mitos e verdades da corrida', sub: 'Progressão, descanso e ritmo confortável.',
    caption: `Correr estraga o joelho? Tem que correr todo dia? 🤔
Com plano, progressão e descanso, correr fica mais seguro e mais leve. Em breve no EAFIT Run.

${CTA}

${TAGS}`,
  },
  {
    key: 'corrida-edu-forca', print: 'run-ao-vivo', hook: 'Quer correr melhor? Treine força', title: 'Força para quem corre', sub: 'Agachamento, afundo, panturrilha e prancha.',
    caption: `Quem corre e treina força corre melhor. 💪
Em breve no EAFIT: programa de corrida com treino de força para corredor.

${CTA}

${TAGS}`,
  },
  {
    key: 'corrida-edu-primeira-prova', print: 'run-desafios', hook: 'Vai correr a sua primeira prova?', title: 'Escolha a sua corrida', sub: 'Próximas provas do seu estado. Em breve.',
    caption: `A primeira prova não precisa dar medo. 🏁
Em breve o EAFIT Run vai mostrar as próximas corridas do seu estado para você escolher a sua.

${CTA}

${TAGS}`,
  },
];

const mediaVid = (file) => JSON.stringify([{ type: 'video', url: `${SITE}/img/marketing/${file}` }]);

async function videos() {
  const plan = await audioPlan(3);
  for (const [i, [key, title, sub, print, variant]] of STORIES.entries()) {
    const audio = plan.story(i) || join(tmpdir(), `eafit-story-corrida-edu-v${variant}.wav`);
    if (typeof audio === 'string') writeFileSync(audio, makeWav(STORY_DURATION, { style: 'run', bpm: 128, sweeps: [STORY_DROP], shift: SHIFTS[variant % 6] }));
    const img = await loadImage(readFileSync(join(PRINTS, `${print}.webp`)));
    const story = { pill: 'EAFIT RUN', title, sub, variant };
    await renderVideo(`story-${key}.mp4`, STORY_DURATION, audio, (ctx, im, t) => drawStoryFrame(ctx, story, im, t), img);
    console.log('ok', `story-${key}.mp4`);
  }
  const wav = join(tmpdir(), 'eafit-reel-corrida-edu.wav');
  writeFileSync(wav, makeWav(DURATION, { style: 'run', bpm: 140, sweeps: [3.4, 9.6] }));
  for (const [i, reel] of REELS.entries()) {
    const audio = plan.reel(i) || wav;
    const img = await loadImage(readFileSync(join(PRINTS, `${reel.print}.webp`)));
    await renderVideo(`reel-${reel.key}.mp4`, DURATION, audio, (ctx, im, t) => drawReelFrame(ctx, reel, im, t), img);
    console.log('ok', `reel-${reel.key}.mp4`);
  }
}

const sqlText = (s) => `'${s.replace(/'/g, "''")}'`;
const mediaImg = (files) => JSON.stringify(files.map((f) => ({ type: 'image', url: `${SITE}/img/marketing/${f}` })));

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (process.env.ONLY === 'videos') return videos();
  const items = [];
  for (const c of CAROUSELS) {
    const files = [`${c.key}-1.jpg`];
    writeFileSync(join(OUT, files[0]), slideArt(c.headline, { big: true, small: 'Deslize →' }));
    c.slides.forEach(([n, text], i) => {
      const f = `${c.key}-${i + 2}.jpg`;
      writeFileSync(join(OUT, f), slideArt(text, { number: n }));
      files.push(f);
    });
    const last = `${c.key}-${c.slides.length + 2}.jpg`;
    writeFileSync(join(OUT, last), await printArt({ headline: c.closing, sub: 'Em breve · eafit.com.br', print: 'run-inicio' }, 'feed', FOOTER));
    files.push(last);
    items.push({ key: `${c.key}-feed`, format: 'feed', caption: c.caption, media: mediaImg(files) });
    console.log('ok', c.key, `${files.length} imagens`);
  }
  // Vídeos intercalados com os carrosséis: Reel/story do mesmo tema logo após o carrossel.
  const vid = (key, format, caption) => ({ key, caption, format, media: mediaVid(`${format === 'reel' ? 'reel' : 'story'}-${key.replace(/-(reel|story)$/, '')}.mp4`) });
  const byName = (k) => items.find((it) => it.key === `${k}-feed`);
  const ordered = [
    byName('corrida-edu-mitos'), vid('corrida-edu-mitos-reel', 'reel', REELS[0].caption), vid('corrida-edu-mitos-story', 'story', ''),
    byName('corrida-edu-aquecimento'), vid('corrida-edu-aquecimento-story', 'story', ''),
    byName('corrida-edu-forca'), vid('corrida-edu-forca-reel', 'reel', REELS[1].caption),
    byName('corrida-edu-lesao'), byName('corrida-edu-tenis'), byName('corrida-edu-pre-corrida'),
    byName('corrida-edu-primeira-prova'), vid('corrida-edu-primeira-prova-reel', 'reel', REELS[2].caption), vid('corrida-edu-provas-story', 'story', ''),
  ];
  const values = ordered.map((it, i) => `  (${i + 1}, ${sqlText(it.key)}, ${sqlText(it.format || 'feed')}, ${sqlText(it.caption)}, ${sqlText(it.media)})`);
  if (process.env.ONLY !== 'imagens') await videos();
  const sql = `-- Marketing do módulo Corrida: carrosséis educativos e de produto reescritos como "Em breve".
-- Gerado por app-admin/scripts/marketing-corrida-educativo.mjs. O módulo ainda não foi lançado, então nada
-- diz que já dá para usar: os itens já na fila (ainda não publicados) passam a sair com o módulo DESLIGADO
-- (hide_when_module = 'corrida') e param quando ele liga. Imagens e vídeos mantêm o mesmo nome de arquivo.
update public.marketing_autopost_queue q
set caption = v.caption, requires_module = null, hide_when_module = 'corrida'
from (values
${values.join(',\n')}
) as v(n, key, format, caption, media)
where q.key = v.key and q.posted_at is null;
`;
  writeFileSync(join(root, 'supabase', 'migrations', '20270301000000_marketing_corrida_educativo_embreve.sql'), sql);
  console.log(`${ordered.length} itens na fila (SQL gerado)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
