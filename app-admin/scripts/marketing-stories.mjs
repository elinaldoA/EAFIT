// Stories em vídeo da publicação automática do Marketing, com música:
//   - nutrição, nos horários das refeições (café, almoço, jantar: 4 de cada) e de hidratação (15h: 12);
//   - os 6 stories gerais (13h), que antes eram só imagem, agora em vídeo;
//   - 8 stories gerais das telas novas do app (musculos, carga, recordes...);
//   - 8 stories para personal trainers (modo Personal: painel, alunos, ficha...);
//   - 5 stories de amigos, liga do mês, treinador por voz e temporada.
// Feitos só com os prints do app e a trilha eletrônica original (src/lib/reelAudio.js).
// Cada story usa uma variante visual (cor, fundo e enquadramento: reelRender.js).
//
//   node app-admin/scripts/marketing-stories.mjs            (todos)
//   ONLY=agua node app-admin/scripts/marketing-stories.mjs (só um grupo: nutri | geral | agua | novas | personal | recursos)
//
// Precisa do ffmpeg no PATH. Gera os MP4 em app-react/public/landing/img/marketing/
// (story-*.mp4) e o SQL dos itens em
// supabase/migrations/20270104010000_marketing_story_slots.items.sql.txt (colado na migration).
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeWav } from './marketing-reels-audio.mjs';
import { FPS, H, STORY_DROP, STORY_DURATION, W, drawStoryFrame } from '../src/lib/reelRender.js';

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
  agua: {
    pill: 'HIDRATAÇÃO', style: 'bright', label: 'hidratação',
    items: [
      ['Já bebeu água hoje?', 'Registre cada copo no app.', 'agua'],
      ['Meio da tarde: hora de hidratar', 'Confira quanto falta para a meta de água.', 'agua'],
      ['Hidratação é parte do treino', 'Água em dia, mais rendimento.', 'agua'],
      ['Um copo agora?', 'Anote no app e acompanhe a meta do dia.', 'agua'],
      ['Água antes do treino', 'Chegue hidratado e treine mais forte.', 'agua'],
      ['Treinou? Reponha a água', 'Registre o que bebeu depois do treino.', 'agua'],
      ['Sede é sinal tardio', 'Beba aos poucos ao longo do dia.', 'agua'],
      ['Meta de água do dia', 'Quantos copos já foram?', 'agua'],
      ['Garrafinha sempre por perto', 'Anote cada gole no app.', 'agua'],
      ['Pele, foco e energia', 'Hidratação em dia ajuda em tudo.', 'agua'],
      ['Falta pouco para a meta?', 'Veja quanto resta e termine o dia em dia.', 'agua'],
      ['Hábito simples, resultado grande', 'Acompanhe a água dia após dia.', 'agua'],
    ],
  },
};

// Stories gerais (13h): mesmos títulos das artes de imagem que já estão na fila.
const GENERAL = [
  ['treino', 'Treino pronto em segundos', 'Monte, envie e acompanhe.', 'treino'],
  ['evolucao', 'Quem vê a evolução não desiste', 'Cada carga e cada série viram progresso.', 'evolucao'],
  ['ao-vivo', 'Registre cada série na hora', 'Treino ao vivo, sem papel.', 'ao-vivo'],
  ['historico', 'Todo o histórico num só lugar', 'Treinos, cargas e datas sempre à mão.', 'historico'],
  ['nutricao', 'Treino e alimentação juntos', 'Calorias e macros no mesmo app.', 'nutricao'],
  ['agua', 'Meta de água em dia', 'Um hábito simples que muda o treino.', 'agua'],
];

// Terceira leva (migration 20270108010000): telas novas do app. Mesmo texto das
// artes do feed (marketing-autopost-content.mjs). ONLY=novas gera só estes.
const NEW_GENERAL = [
  ['musculos', 'Qual músculo ficou para trás?', 'O app mostra o volume da semana de cada músculo.', 'musculos'],
  ['carga', 'Sua carga subindo, semana a semana', 'Escolha o exercício e veja a evolução.', 'carga'],
  ['consistencia', 'Constância que dá para ver', 'Os últimos 35 dias de treino num só quadro.', 'consistencia'],
  ['recordes', 'Seus recordes, todos anotados', 'Maior carga e 1RM estimado de cada exercício.', 'recordes'],
  ['corpo', 'Peso e medidas no mesmo lugar', 'Acompanhe o corpo mudando, mês a mês.', 'corpo'],
  ['progressao', 'O app sugere a carga de hoje', 'Com base no que você fez no último treino.', 'progressao'],
  ['nutricao-macros', 'Proteína, carbo e gordura num toque', 'Veja quanto falta para a meta do dia.', 'nutricao-macros'],
  ['nutricao-semana', 'Quanto você gasta de verdade?', 'O app calcula pelo seu diário e pela balança.', 'nutricao-semana'],
];

// Quarta leva (migration 20270109010000): modo Personal, para personal trainers.
// Mesmo texto das artes do feed. ONLY=personal gera só estes.
const PERSONAL = [
  ['personal-painel', 'Todos os seus alunos num painel', 'Quem treinou, quem sumiu e quem precisa de você hoje.', 'pt-painel'],
  ['personal-alunos', 'Cada aluno com a sua aderência', 'Treinos da semana, últimos 14 dias e plano.', 'pt-alunos'],
  ['personal-treinos', 'Veja o que o aluno fez de verdade', 'Cada treino, carga e série, com o que evoluiu.', 'pt-ficha-treinos'],
  ['personal-evolucao', 'A evolução do aluno em gráfico', 'Peso, medidas e como ele tem se sentido.', 'pt-ficha-evolucao'],
  ['personal-montar', 'Monte e envie o treino pelo app', 'Dias, exercícios, séries e prazo do plano.', 'pt-montar-treino'],
  ['personal-modelos', 'Seus treinos prontos para reusar', 'Salve modelos e envie para vários alunos.', 'pt-modelos'],
  ['personal-conversa', 'Recado direto no app do aluno', 'Sem misturar com o seu WhatsApp pessoal.', 'pt-conversa'],
  ['personal-agenda', 'Aulas marcadas e confirmadas', 'O aluno confirma a aula pelo app.', 'pt-agenda'],
];

// Quinta leva (migration 20270110010000): amigos, liga, treinador por voz e
// temporada. Mesmo texto das artes do feed. ONLY=recursos gera só estes.
const RECURSOS = [
  ['amigos', 'Treine junto com os amigos', 'Ranking da semana por dias treinados.', 'amigos'],
  ['amigos-atividade', 'Comemore os recordes dos amigos', 'Treinos, recordes e sequências de quem treina com você.', 'amigos-atividade'],
  ['liga', 'Liga do mês: quem treina mais vence', 'Divisões Ouro, Prata e Bronze, com medalha para o top 3.', 'liga'],
  ['treinador-voz', 'Um treinador falando no seu ouvido', 'Apresenta os exercícios, conta o descanso e comemora recordes.', 'treinador-voz'],
  // Temporada: só sai enquanto o tema estiver no ar no app (coluna season da fila).
  ['temporada-novembro-azul', 'Novembro Azul no EAFIT', 'Treino em dia e exames de rotina também.', 'temporada-novembro-azul'],
  ['temporada', 'Natal no EAFIT', 'Treine no período e ganhe a conquista Treino de Natal.', 'temporada-natal'],
  ['temporada-ano-novo', 'Comece o ano treinando', 'Treine na primeira semana e ganhe a conquista Ano Novo.', 'temporada-ano-novo'],
];

const SHIFTS = [0, 2, 3, 5, 7, -2]; // transposição da trilha original por variante

// Trilha licenciada (opcional): app-admin/music/song.mp3, fora do site e do git.
// Cada story usa um trecho de 8 s diferente, começando de forma que uma batida
// forte caia no "drop" do visual (STORY_DROP). Sem o arquivo, usa a trilha original.
const SONG = process.env.SONG || join(root, 'app-admin', 'music', 'song.mp3');
const HOP = 512;
const AN_SR = 11025;

function decodeMono(file) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(AN_SR), '-f', 'f32le', '-'], { stdio: ['ignore', 'pipe', 'inherit'] });
    const chunks = [];
    ff.stdout.on('data', (c) => chunks.push(c));
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg saiu com ${code}`));
      const buf = Buffer.concat(chunks);
      resolve(new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4)));
    });
  });
}

// Instantes (s) das batidas mais fortes: aumento de energia entre janelas curtas.
async function strongOnsets(file, count) {
  const pcm = await decodeMono(file);
  const frames = Math.floor(pcm.length / HOP);
  const energy = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    let e = 0;
    for (let k = 0; k < HOP; k += 1) e += pcm[i * HOP + k] ** 2;
    energy[i] = Math.sqrt(e / HOP);
  }
  const total = pcm.length / AN_SR;
  const flux = [];
  for (let i = 8; i < frames - 1; i += 1) {
    let avg = 0;
    for (let k = 1; k <= 8; k += 1) avg += energy[i - k];
    avg /= 8;
    const t = (i * HOP) / AN_SR;
    if (t > STORY_DROP && t < total - (STORY_DURATION - STORY_DROP) - 0.2) flux.push({ t, v: Math.max(0, energy[i] - avg) });
  }
  const chosen = [];
  for (const o of flux.sort((a, b) => b.v - a.v)) {
    if (chosen.length >= count) break;
    if (chosen.every(c => Math.abs(c.t - o.t) >= 4.5)) chosen.push(o);
  }
  // Se a música é curta para tantos trechos, repete os mesmos em outra ordem.
  const times = chosen.map(c => c.t).sort((a, b) => a - b);
  return Array.from({ length: count }, (_, i) => times[(i * 7) % times.length] - STORY_DROP);
}

async function render(file, story, print) {
  const img = await loadImage(readFileSync(join(PRINTS, `${print}.webp`)));
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  let audioIn;
  if (story.songStart !== undefined) {
    audioIn = ['-ss', story.songStart.toFixed(3), '-t', String(STORY_DURATION), '-i', SONG];
  } else {
    const audio = join(tmpdir(), `eafit-story-v${story.variant}.wav`);
    writeFileSync(audio, makeWav(STORY_DURATION, { style: 'electric', sweeps: [STORY_DROP], shift: SHIFTS[story.variant % 6] }));
    audioIn = ['-i', audio];
  }
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
    ...audioIn,
    ...(story.songStart !== undefined ? ['-af', `afade=t=in:d=0.12,afade=t=out:st=${STORY_DURATION - 0.8}:d=0.8,loudnorm=I=-14:TP=-1.5:LRA=11`] : []),
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
  if (only === 'agua') position = 38; // só a hidratação: continua depois dos stories de refeição

  // Trechos da trilha licenciada, um por story (SONG_OFF=1 usa a trilha original).
  const useSong = existsSync(SONG) && process.env.SONG_OFF !== '1';
  const starts = useSong ? await strongOnsets(SONG, 40) : [];
  let used = 0;
  const songStart = () => (useSong ? starts[used++ % starts.length] : undefined);
  console.log(useSong ? `Trilha: ${SONG}` : 'Trilha original (sem song.mp3)');

  if (!only || only === 'nutri' || only === 'agua') {
    for (let n = 0; n < 12; n += 1) {
      for (const [slot, meal] of Object.entries(MEALS)) {
        if (only === 'agua' ? slot !== 'agua' : slot === 'agua') continue;
        if (!meal.items[n]) continue;
        const [title, sub, print] = meal.items[n];
        const file = `story-${slot}-${n + 1}.mp4`;
        await render(file, { pill: meal.pill, title, sub, variant: (n + Object.keys(MEALS).indexOf(slot) * 2) % 6, songStart: songStart() }, print);
        position += 1;
        rows.push(`  (${position}, ${sqlText(`nutri-${slot}-${n + 1}`)}, 'story', ${sqlText(slot)}, '', ${sqlText(mediaOf(file))}::jsonb)`);
        console.log('ok', file);
      }
    }
  }
  if (!only || only === 'geral') {
    for (const [i, [key, title, sub, print]] of GENERAL.entries()) {
      const file = `story-${key}.mp4`;
      await render(file, { title, sub, variant: i % 6, songStart: songStart() }, print);
      updates.push(`update public.marketing_autopost_queue set media = ${sqlText(mediaOf(file))}::jsonb where key = ${sqlText(`${key}-story`)} and posted_at is null;`);
      console.log('ok', file);
    }
  }
  // Os itens da fila destes ficam na migration 20270108010000 (com as artes do feed).
  if (!only || only === 'novas') {
    used = 18; // mesmos trechos da trilha da execução completa (depois de refeições e gerais)
    for (const [i, [key, title, sub, print]] of NEW_GENERAL.entries()) {
      const file = `story-${key}.mp4`;
      await render(file, { title, sub, variant: (i + 2) % 6, songStart: songStart() }, print);
      console.log('ok', file);
    }
  }
  // Itens da fila na migration 20270109010000 (com as artes do feed).
  if (!only || only === 'personal') {
    used = 26; // depois de refeições, gerais e telas novas
    for (const [i, [key, title, sub, print]] of PERSONAL.entries()) {
      const file = `story-${key}.mp4`;
      await render(file, { pill: 'PARA PERSONAL', title, sub, variant: (i + 4) % 6, songStart: songStart() }, print);
      console.log('ok', file);
    }
  }
  // Itens da fila na migration 20270110010000 (com as artes do feed).
  if (!only || only === 'recursos') {
    used = 34; // depois de refeições, gerais, telas novas e personal
    for (const [i, [key, title, sub, print]] of RECURSOS.entries()) {
      const file = `story-${key}.mp4`;
      await render(file, { title, sub, variant: (i + 1) % 6, songStart: songStart() }, print);
      console.log('ok', file);
    }
  }
  writeFileSync(
    join(root, 'supabase', 'migrations', '20270104010000_marketing_story_slots.items.sql.txt'),
    `${rows.length ? `insert into public.marketing_autopost_queue (position, key, format, slot, caption, media) values\n${rows.join(',\n')};\n` : ''}${updates.join('\n')}\n`,
  );
}

main();
