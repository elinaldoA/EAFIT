// 2ª leva "Em breve" do módulo Corrida (EAFIT Run): mostra as funções que ainda não apareciam na campanha
// (provas perto de você, sua prova com contagem regressiva, cartão de compartilhar, tênis, clima, desafio da
// semana) e segura a faixa de stories, que ficava muda com o foco na campanha. Mesmo critério do teaser
// original: não diz que já dá para usar; os itens saem enquanto o módulo está desligado
// (hide_when_module = 'corrida') e param quando ele liga.
//
//   node app-admin/scripts/marketing-corrida-embreve2.mjs        (precisa do ffmpeg no PATH)
//   ONLY=imagens node app-admin/scripts/marketing-corrida-embreve2.mjs
//
// Os prints run-provas, run-sua-prova, run-cartao, run-tenis e run-clima (app-react/public/landing/img/app)
// saem do app em modo demo (Supabase falso do e2e + Chrome), sem conta nem produção.
// Saída: embreve-corrida-* em app-react/public/landing/img/marketing/ e a migration
// supabase/migrations/20270228030000_marketing_corrida_embreve2.sql.
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
const PRINTS = join(root, 'app-react', 'public', 'landing', 'img', 'app');
const OUT = join(root, 'app-react', 'public', 'landing', 'img', 'marketing');
const SITE = 'https://eafit.com.br';
const TAGS = '#corrida #corridaderua #running #embreve #EAFIT';
const CTA = 'Quer ser avisado quando abrir? Entre na lista de espera: eafit.com.br/corrida/?origem=post#avise-me 🏃';
const FOOTER = 'Em breve · eafit.com.br';

// [chave, título, subtítulo, print, variante visual]
export const STORIES = [
  ['embreve-corrida-provas', 'Qual corrida você vai fazer?', 'As provas do seu estado, em breve no app.', 'run-provas', 0],
  ['embreve-corrida-sua-prova', 'Quantos dias faltam para a sua prova?', 'Contagem regressiva e programa. Em breve.', 'run-sua-prova', 2],
  ['embreve-corrida-cartao', 'Seu cartão de corrida para os stories', 'Mapa, ritmo e tempo. Em breve no app.', 'run-cartao', 4],
  ['embreve-corrida-tenis', 'Seu tênis avisa a hora de trocar', 'Os km de cada par, no app. Em breve.', 'run-tenis', 1],
  ['embreve-corrida-clima', 'Que tempo faz na sua corrida?', 'Clima e conselho antes de sair. Em breve.', 'run-clima', 3],
  ['embreve-corrida-semana', '3 corridas nesta semana?', 'Desafios do mês e da semana. Em breve.', 'run-desafios', 5],
];

export const REEL = {
  key: 'embreve-corrida-sua-prova', print: 'run-sua-prova', hook: 'Qual é a sua próxima prova?', title: 'Conte os dias até a corrida', sub: 'Contagem regressiva e programa de treino.', ctaTitle: 'Lista de espera', ctaSub: 'Entre e seja avisado', url: 'eafit.com.br/corrida',
  caption: `Marcou a sua prova? Então o app conta os dias por você. 🏁\nEm breve no EAFIT Run: escolha a corrida, veja quanto falta e receba o programa de treino até lá.\n\n${CTA}\n\n${TAGS}`,
};

export const CAROUSELS = [
  {
    key: 'embreve-corrida-ritmo', headline: 'Ritmo de conversa: o segredo de correr mais',
    slides: [
      ['1', 'Se dá para conversar enquanto corre, o ritmo está certo'],
      ['2', 'Se só dá para falar palavras soltas, está rápido demais'],
      ['3', 'Quem começa deve fazer quase tudo nesse ritmo'],
      ['4', 'O ritmo leve constrói base e evita lesão'],
      ['5', 'Deixe o ritmo forte para um ou dois treinos por semana'],
    ],
    closing: 'Corra com plano. Em breve no EAFIT Run.',
    print: 'run-ao-vivo',
    caption: `Correr devagar também é treinar. 🗣️\nSalve este post e mande para o seu parceiro de corrida.\nEm breve no EAFIT Run: ritmo por km e programa de treino no app.\n\n${CTA}\n\n${TAGS}`,
  },
  {
    key: 'embreve-corrida-10k', headline: 'Sua primeira corrida de 10 km',
    slides: [
      ['1', 'Antes dos 10 km, corra 5 km com conforto'],
      ['2', 'Treine 3 vezes por semana, com descanso entre elas'],
      ['3', 'Faça um longão por semana e aumente aos poucos'],
      ['4', 'Na prova, comece mais devagar do que no treino'],
      ['5', 'Beba água e comemore: terminar já é vitória'],
    ],
    closing: 'Programa de 10K em breve no EAFIT Run.',
    print: 'run-sua-prova',
    caption: `Primeiros 10 km sem improviso. 🏁\nSalve estes passos para o seu treino.\nEm breve no EAFIT Run: escolha a prova, veja quanto falta e siga o programa de 10K.\n\n${CTA}\n\n${TAGS}`,
  },
];

const sqlText = (s) => `'${s.replace(/'/g, "''")}'`;
const mediaImg = (files) => JSON.stringify(files.map((f) => ({ type: 'image', url: `${SITE}/img/marketing/${f}` })));
const mediaVid = (file) => JSON.stringify([{ type: 'video', url: `${SITE}/img/marketing/${file}` }]);

async function images() {
  const rows = {};
  for (const c of CAROUSELS) {
    const files = [`${c.key}-1.jpg`];
    writeFileSync(join(OUT, files[0]), slideArt(c.headline, { big: true, small: 'Deslize →' }));
    c.slides.forEach(([n, text], i) => {
      const f = `${c.key}-${i + 2}.jpg`;
      writeFileSync(join(OUT, f), slideArt(text, { number: n }));
      files.push(f);
    });
    const last = `${c.key}-${c.slides.length + 2}.jpg`;
    writeFileSync(join(OUT, last), await printArt({ headline: c.closing, sub: 'Em breve no app.', print: c.print }, 'feed', FOOTER));
    files.push(last);
    rows[c.key] = { key: `${c.key}-feed`, format: 'feed', caption: c.caption, media: mediaImg(files) };
    console.log('ok', c.key, `${files.length} imagens`);
  }
  return rows;
}

async function videos() {
  const plan = await audioPlan(5);
  for (const [i, [key, title, sub, print, variant]] of STORIES.entries()) {
    const audio = plan.story(i) || join(tmpdir(), `eafit-story-embreve2-v${variant}.wav`);
    if (typeof audio === 'string') writeFileSync(audio, makeWav(STORY_DURATION, { style: 'run', bpm: 128, sweeps: [STORY_DROP], shift: SHIFTS[variant % 6] }));
    const img = await loadImage(readFileSync(join(PRINTS, `${print}.webp`)));
    const story = { pill: 'EM BREVE', title, sub, variant, cta: 'ENTRE NA LISTA DE ESPERA', url: 'eafit.com.br/corrida' };
    await renderVideo(`story-${key}.mp4`, STORY_DURATION, audio, (ctx, im, t) => drawStoryFrame(ctx, story, im, t), img);
    console.log('ok', `story-${key}.mp4`);
  }
  const wav = join(tmpdir(), 'eafit-reel-embreve2.wav');
  writeFileSync(wav, makeWav(DURATION, { style: 'run', bpm: 140, sweeps: [3.4, 9.6] }));
  const audio = plan.reel(0) || wav;
  const img = await loadImage(readFileSync(join(PRINTS, `${REEL.print}.webp`)));
  await renderVideo(`reel-${REEL.key}.mp4`, DURATION, audio, (ctx, im, t) => drawReelFrame(ctx, REEL, im, t), img);
  console.log('ok', `reel-${REEL.key}.mp4`);
}

// Ordem: alterna story, Reel e feed para a faixa de cada formato nunca ficar sem item por muito tempo.
function writeSql(byKey) {
  const story = (k) => ({ key: `${k}-story`, format: 'story', caption: '', media: mediaVid(`story-${k}.mp4`) });
  const items = [
    story('embreve-corrida-provas'),
    story('embreve-corrida-sua-prova'),
    { key: 'embreve-corrida-sua-prova-reel', format: 'reel', caption: REEL.caption, media: mediaVid(`reel-${REEL.key}.mp4`) },
    byKey['embreve-corrida-ritmo'],
    story('embreve-corrida-cartao'),
    story('embreve-corrida-tenis'),
    byKey['embreve-corrida-10k'],
    story('embreve-corrida-clima'),
    story('embreve-corrida-semana'),
  ];
  const values = items.map((it, i) => `  (${i + 1}, ${sqlText(it.key)}, ${sqlText(it.format)}, ${sqlText(it.caption)}, ${sqlText(it.media)})`);
  const sql = `-- Marketing do módulo Corrida: 2ª leva "Em breve" (provas perto de você, sua prova, cartão de compartilhar,
-- tênis, clima e desafio da semana, mais 2 carrosséis de dicas). Gerado por
-- app-admin/scripts/marketing-corrida-embreve2.mjs. Saem com o módulo Corrida DESLIGADO (mesmo critério do
-- pré-lançamento: o foco na campanha só libera itens da campanha) e param quando ele liga.
insert into public.marketing_autopost_queue (position, key, format, caption, media, hide_when_module)
select (select coalesce(max(position), 0) from public.marketing_autopost_queue) + v.n, v.key, v.format, v.caption, v.media::jsonb, 'corrida'
from (values
${values.join(',\n')}
) as v(n, key, format, caption, media)
where not exists (select 1 from public.marketing_autopost_queue q where q.key = v.key);
`;
  writeFileSync(join(root, 'supabase', 'migrations', '20270228030000_marketing_corrida_embreve2.sql'), sql);
  console.log(`${items.length} itens na fila (SQL gerado)`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const byKey = await images();
  if (process.env.ONLY !== 'imagens') await videos();
  writeSql(byKey);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
