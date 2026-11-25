// Peças de SUSPENSE do EAFIT Run para o período antes do lançamento (21/11 a 30/11): só texto animado e música,
// sem telas do app e sem citar funcionalidades do módulo. Servem para manter a audiência interessada e levar para
// a lista de espera (eafit.com.br/corrida/?origem=<rede>#avise-me; a legenda guarda origem=post e a publicação troca
// pela rede). Todas são VÍDEO com música (trilha de app-admin/music) e fecham com "EM BREVE · Aguarde" + o convite.
// Os textos pedem resposta, comentário, salvamento e marcação de amigos, para gerar engajamento.
//
//   node app-admin/scripts/marketing-corrida-suspense.mjs        (precisa do ffmpeg no PATH)
//   ONLY=story-s03 node app-admin/scripts/marketing-corrida-suspense.mjs   (um arquivo)
//
// Saída: suspense-corrida-{story,feed,reel}-*.mp4 em app-react/public/landing/img/marketing/ e a migration
// supabase/migrations/20270304170000_marketing_corrida_suspense_video.sql (atualiza as peças da fila).
// Saem enquanto o módulo está desligado (hide_when_module = 'corrida') e param quando ele liga.
import { loadImage } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeWav } from './marketing-reels-audio.mjs';
import { FONT, background, wrap } from './marketing-autopost-content.mjs';
import { audioPlan, renderVideo } from './marketing-corrida-launch.mjs';
import { DURATION, H, STORY_DROP, STORY_DURATION, W } from '../src/lib/reelRender.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(root, 'app-react', 'public', 'landing', 'img', 'marketing');
const SITE = 'https://eafit.com.br';
const TAGS = '#corrida #corridaderua #running #embreve #EAFIT';
const CTA = 'Quer ser avisado quando abrir? Entre na lista de espera: eafit.com.br/corrida/?origem=post#avise-me 🏃';
const ACCENT = '#f97316';
const URL_SHOWN = 'eafit.com.br/corrida';
const BEAT = 60 / 128;
let LOGO = null; // logo da marca (ícone do app), carregada em main() e desenhada em todas as peças

// Stories (8 s): [chave, gancho, segunda frase]. Cada peça tem gancho e frase próprios, sem repetir entre si.
export const STORIES = [
  ['s01', 'Você corre?', 'Responde EU se você corre.'],
  ['s02', 'EAFIT Run vem aí.', 'Quem já estava esperando?'],
  ['s03', 'Calce o tênis.', 'Dezembro começa correndo.'],
  ['s04', 'Corre sozinho ou em dupla?', 'Marque seu parceiro de treino.'],
  ['s05', 'Corra com a gente.', 'Quem aí já sabe o nome?'],
  ['s06', 'Tá chegando a hora.', 'Você vai estar pronto?'],
  ['s07', 'Sua próxima corrida começa aqui.', 'Manda para quem corre contigo.'],
  ['s08', 'Já tem plano para dezembro?', 'Um nome novo na sua rotina: EAFIT Run.'],
  ['s09', 'Quer ser o primeiro a saber?', 'Entre na lista de espera.'],
  ['s10', 'Contagem regressiva.', '1º de dezembro, às 10h.'],
];

// Stories NOVOS (25 a 30/11), sem repetir gancho nem frase das peças acima. Gerados com NOVAS=1 (só estes; escreve a migration
// 20270306080000 e não mexe nas peças que já existem).
export const NEW_STORIES = [
  ['s11', 'Qual é o seu ritmo?', 'Responde: tranquilo ou acelerado?'],
  ['s12', 'Rua ou esteira?', 'Conta aqui onde você corre.'],
  ['s13', 'O tênis já está pronto?', 'Manda um 👟 se está.'],
  ['s14', 'Madrugada, manhã ou noite?', 'Qual é a sua hora de correr?'],
  ['s15', 'Quem te chama para correr?', 'Marque quem te leva para correr.'],
  ['s16', 'Amanhã é o dia.', 'EAFIT Run abre às 10h.'],
];

// Feeds (vídeo de 12 s, saem como vídeo no feed): [chave, gancho, segunda frase, legenda]
export const FEEDS = [
  ['f01', 'Bateu vontade de correr?', 'Agora ela tem nome.', 'Aquela vontade de calçar o tênis e sair já tem nome: EAFIT Run. 🏃\n\nMarque aquele amigo que não perde uma corrida. 👇'],
  ['f02', 'Manhã ou noite?', 'Quando você corre?', 'Manhã ☀️ ou noite 🌙? Conta nos comentários a sua hora de correr.\nO EAFIT Run está chegando para quem ama correr.'],
  ['f03', 'Anote na agenda.', 'Dia 1º, às 10h.', 'Anote na agenda: 1º de dezembro, às 10h. 📅\nSalve este post para não esquecer. O EAFIT Run abre para todo mundo nesse dia.'],
  ['f04', 'Falta pouco.', 'Quem está contando os dias?', 'Falta pouco. ⏳\nQuem aí já está contando os dias? Comenta 🔥 e entre na lista de espera para ser avisado.'],
];

// Reels (12 s): [chave, gancho, segunda frase, legenda]
export const REELS = [
  ['r01', 'Ouviu o barulho do tênis?', 'Já deu para adivinhar?', 'O barulho do tênis na rua já tem trilha nova. 🎧\nO EAFIT Run vem aí, para quem ama correr. Comenta EU se você corre. 👇'],
  ['r02', 'Quem corre vai entender.', 'Sem spoiler. Só o nome: EAFIT Run.', 'Quem corre vai entender. 👟\nSem spoiler: por enquanto só o nome, EAFIT Run. Marque quem corre com você.'],
  ['r03', 'Prepare o tênis.', 'A largada está chegando.', 'Prepare o tênis. 👟\nA largada do EAFIT Run está chegando. Salve para lembrar.'],
  ['r04', 'Não conta pra ninguém.', 'Ou conta, e chama a turma.', 'Não conta pra ninguém… ou conta, e chama a turma. 😉\nO EAFIT Run está chegando. Compartilhe com a turma.'],
];

const ease = (x) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;
const clamp = (x) => Math.min(1, Math.max(0, x));

// Três cenas: gancho, segunda frase e fecho "EM BREVE · Aguarde" com o convite. `t2`/`t3` = início das cenas 2 e 3;
// `drop` = batida forte da trilha (o brilho pulsa mais depois dela).
function makeFrame(hook, line2, { total, drop, t2, t3 }) {
  return (ctx, _im, t) => {
    background(ctx, W, H);
    const pulse = Math.exp(-(t % BEAT) * 7) * (t >= drop ? 1 : 0.4);
    ctx.save();
    ctx.strokeStyle = `rgba(249,115,22,${0.1 + 0.2 * pulse})`;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(W / 2, 900, 300 + 90 * pulse + t * 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (LOGO) {
      const ls = 180; // abaixo da faixa que o Instagram cobre no topo do story
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(W / 2 - ls / 2, 270, ls, ls, 40);
      ctx.clip();
      ctx.drawImage(LOGO, W / 2 - ls / 2 - ls * 0.08, 270 - ls * 0.08, ls * 1.16, ls * 1.16);
      ctx.restore();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.font = `800 50px ${FONT}`;
      ctx.fillText('EAFIT RUN', W / 2, 270 + ls + 56);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const draw = (text, y, size, color, alpha, weight = 800, scale = 1) => {
      if (alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = clamp(alpha);
      ctx.fillStyle = color;
      ctx.font = `${weight} ${size}px ${FONT}`;
      const lines = wrap(ctx, text, W - 160, 3);
      ctx.translate(W / 2, y);
      ctx.scale(scale, scale);
      lines.forEach((l, i) => ctx.fillText(l, 0, i * (size + 14)));
      ctx.restore();
    };

    // Cena 1: gancho.
    const in1 = ease((t - 0.2) / 0.6);
    const out1 = 1 - ease((t - (t2 - 0.25)) / 0.4);
    draw(hook, 820 + (1 - in1) * 50, 124, '#fff', in1 * out1, 800, 1 + 0.015 * pulse);
    if (in1 * out1 > 0) {
      ctx.fillStyle = ACCENT;
      ctx.globalAlpha = in1 * out1;
      ctx.font = `800 124px ${FONT}`;
      const extra = (wrap(ctx, hook, W - 160, 3).length - 2) * 138; // gancho de 3 linhas empurra o traço para baixo
      ctx.fillRect(W / 2 - 110 * in1, 1130 + Math.max(0, extra), 220 * in1, 10);
      ctx.globalAlpha = 1;
    }

    // Cena 2: segunda frase (pergunta ou convite a responder).
    const in2 = ease((t - t2) / 0.5);
    const out2 = 1 - ease((t - (t3 - 0.25)) / 0.4);
    draw(line2, 840 + (1 - in2) * 50, 100, '#fff', in2 * out2, 800, 1 + 0.015 * pulse);

    // Cena 3: EM BREVE · Aguarde + convite.
    const in3 = ease((t - t3) / 0.45);
    draw('EM BREVE', 700, 128, ACCENT, in3, 800, 1 + 0.05 * pulse);
    draw('Aguarde.', 900, 84, '#fff', ease((t - t3 - 0.25) / 0.45), 700);
    const inBtn = ease((t - t3 - 0.5) / 0.45);
    if (inBtn > 0) {
      const bw = 820;
      const bh = 104;
      const by = H - 430;
      ctx.save();
      ctx.globalAlpha = inBtn;
      ctx.translate(W / 2, by + bh / 2);
      const k = 1 + 0.035 * pulse;
      ctx.scale(k, k);
      ctx.shadowColor = `rgba(249,115,22,${0.5 + 0.4 * pulse})`;
      ctx.shadowBlur = 30 + 30 * pulse;
      ctx.beginPath();
      ctx.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
      ctx.fillStyle = ACCENT;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0e0e12';
      ctx.font = `800 40px ${FONT}`;
      ctx.fillText('ENTRE NA LISTA DE ESPERA', 0, 3);
      ctx.restore();
      draw(URL_SHOWN, by + bh + 64, 46, '#fff', inBtn, 700);
    }
    ctx.fillStyle = ACCENT;
    ctx.fillRect(0, H - 14, W * clamp(t / total), 14);
  };
}

const STORY_TIMING = { total: STORY_DURATION, drop: STORY_DROP, t2: 3.6, t3: 5.5 };
const VIDEO_TIMING = { total: DURATION, drop: 3.4, t2: 3.5, t3: 9.2 };

const sqlText = (s) => `'${s.replace(/'/g, "''")}'`;
const media = (file) => JSON.stringify([{ type: 'video', url: `${SITE}/img/marketing/${file}` }]);

async function mainNovas() {
  mkdirSync(OUT, { recursive: true });
  LOGO = await loadImage(join(root, 'app-react', 'public', 'icon-512.png'));
  const plan = await audioPlan(2);
  const wavStory = join(tmpdir(), 'eafit-story-suspense.wav');
  writeFileSync(wavStory, makeWav(STORY_DURATION, { style: 'run', bpm: 128, sweeps: [STORY_DROP] }));
  const rows = [];
  for (const [i, [k, hook, line2]] of NEW_STORIES.entries()) {
    const f = `suspense-corrida-story-${k}.mp4`;
    await renderVideo(f, STORY_DURATION, plan.story(STORIES.length + i) || wavStory, makeFrame(hook, line2, STORY_TIMING), null);
    console.log('ok', f);
    rows.push(`  (${sqlText(`suspense-corrida-${k}-story`)}, ${sqlText(media(f))})`);
  }
  // Ordem de saída (1 story por dia, 12:30 BRT): 25/11 s15, 26 s11, 27 s12, 28 s13, 29 s10 (contagem), 30 s16 (véspera),
  // s14 de reserva; as peças antigas ainda não postadas (s03 a s09) ficam depois.
  const order = ['s15', 's11', 's12', 's13', 's10', 's16', 's14', 's03', 's04', 's05', 's06', 's07', 's08', 's09'];
  const pos = order.map((k, i) => `  (${sqlText(`suspense-corrida-${k}-story`)}, ${-99 + i})`);
  const sql = `-- Marketing do Run: 6 stories de suspense NOVOS (s11 a s16), sem repetir os já postados, e nova ordem de saída
-- (1 por dia, 12:30 BRT) até o lançamento em 1º/12. Gerado por app-admin/scripts/marketing-corrida-suspense.mjs (NOVAS=1).
insert into public.marketing_autopost_queue (position, key, format, caption, media, hide_when_module)
select 0, v.key, 'story', '', v.media::jsonb, 'corrida'
from (values
${rows.join(',\n')}
) as v(key, media)
where not exists (select 1 from public.marketing_autopost_queue q where q.key = v.key);

update public.marketing_autopost_queue q
set position = v.pos
from (values
${pos.join(',\n')}
) as v(key, pos)
where q.key = v.key and q.posted_at is null;
`;
  writeFileSync(join(root, 'supabase', 'migrations', '20270306080000_marketing_run_stories_novos.sql'), sql);
  console.log(`${NEW_STORIES.length} stories novos na migration`);
}

async function main() {
  if (process.env.NOVAS === '1') return mainNovas();
  mkdirSync(OUT, { recursive: true });
  LOGO = await loadImage(join(root, 'app-react', 'public', 'icon-512.png'));
  const only = process.env.ONLY || '';
  const wanted = (k) => !only || only === k;
  const plan = await audioPlan(2);
  const wavStory = join(tmpdir(), 'eafit-story-suspense.wav');
  const wavVideo = join(tmpdir(), 'eafit-video-suspense.wav');
  writeFileSync(wavStory, makeWav(STORY_DURATION, { style: 'run', bpm: 128, sweeps: [STORY_DROP] }));
  writeFileSync(wavVideo, makeWav(DURATION, { style: 'run', bpm: 140, sweeps: [3.4, 9.6] }));

  const items = [];
  for (const [i, [k, hook, line2]] of STORIES.entries()) {
    const f = `suspense-corrida-story-${k}.mp4`;
    if (wanted(`story-${k}`)) {
      await renderVideo(f, STORY_DURATION, plan.story(i) || wavStory, makeFrame(hook, line2, STORY_TIMING), null);
      console.log('ok', f);
    }
    items.push({ key: `suspense-corrida-${k}-story`, caption: '', media: media(f) });
  }
  for (const [i, [k, hook, line2, text]] of FEEDS.entries()) {
    const f = `suspense-corrida-feed-${k}.mp4`;
    if (wanted(`feed-${k}`)) {
      await renderVideo(f, DURATION, plan.reel(i) || wavVideo, makeFrame(hook, line2, VIDEO_TIMING), null);
      console.log('ok', f);
    }
    items.push({ key: `suspense-corrida-${k}-feed`, caption: `${text}\n\n${CTA}\n\n${TAGS}`, media: media(f) });
  }
  for (const [i, [k, hook, line2, text]] of REELS.entries()) {
    const f = `suspense-corrida-reel-${k}.mp4`;
    if (wanted(`reel-${k}`)) {
      await renderVideo(f, DURATION, plan.reel(i + FEEDS.length) || wavVideo, makeFrame(hook, line2, VIDEO_TIMING), null);
      console.log('ok', f);
    }
    items.push({ key: `suspense-corrida-${k}-reel`, caption: `${text}\n\n${CTA}\n\n${TAGS}`, media: media(f) });
  }

  const values = items.map((it) => `  (${sqlText(it.key)}, ${sqlText(it.caption)}, ${sqlText(it.media)})`);
  const sql = `-- Marketing do Run: as 18 peças de suspense passam a ser VÍDEO com música (stories, feeds e Reels), fecham com
-- "EM BREVE · Aguarde" e o convite para a lista de espera, e a copy pede resposta, comentário, salvamento e marcação.
-- Gerado por app-admin/scripts/marketing-corrida-suspense.mjs. Só atualiza o que ainda não saiu; o feed com um vídeo
-- só sai como vídeo no feed (Instagram publica como Reel, Facebook como vídeo).
update public.marketing_autopost_queue q
set caption = v.caption, media = v.media::jsonb
from (values
${values.join(',\n')}
) as v(key, caption, media)
where q.key = v.key and q.posted_at is null;
`;
  writeFileSync(join(root, 'supabase', 'migrations', '20270304170000_marketing_corrida_suspense_video.sql'), sql);
  console.log(`${items.length} itens na migration`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
