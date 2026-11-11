// Conteúdo da publicação automática do Marketing: feito só com os prints do
// próprio app (landing/img/app) e slides de texto na identidade da marca.
//
//   node app-admin/scripts/marketing-autopost-content.mjs
//
// Gera as artes em JPEG (o Instagram não aceita WebP) em
// app-react/public/landing/img/marketing/ e o seed SQL em
// supabase/migrations/20261230010000_marketing_autopost.seed.sql.txt, que foi
// colado na migration. Rodar de novo só quando o conteúdo mudar.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drawPhone } from '../src/lib/reelRender.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PRINTS = join(root, 'app-react', 'public', 'landing', 'img', 'app');
const OUT = join(root, 'app-react', 'public', 'landing', 'img', 'marketing');
const SITE = 'https://eafit.com.br';
const TAGS = '#personaltrainer #treino #appdetreino #academia #musculacao';

const SIZES = { feed: [1080, 1350], story: [1080, 1920] };

// kind: 'print' (uma arte com o print) | 'slides' (carrossel de texto)
export const ITEMS = [
  {
    key: 'treino', kind: 'print', print: 'treino', headline: 'Treino pronto em segundos', sub: 'Monte, envie e acompanhe.',
    caption: `Planilha, PDF, WhatsApp… dá para parar. 📲\nMonte o treino no app e ele chega direto no celular do aluno.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'evolucao', kind: 'print', print: 'evolucao', headline: 'Quem vê a evolução não desiste', sub: 'Cada carga e cada série viram progresso.',
    caption: `Aluno que não vê resultado, desiste. 💔\nMostre a evolução de cada carga e de cada série. O app faz isso sozinho.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'sinais', kind: 'slides', headline: '5 sinais de que seu aluno vai cancelar',
    slides: [
      ['1', 'Falta duas semanas seguidas'],
      ['2', 'Para de registrar as cargas'],
      ['3', 'Responde só “ok” às mensagens'],
      ['4', 'Reclama que “não vê resultado”'],
      ['5', 'Pede para pausar o plano'],
    ],
    closing: 'Acompanhe tudo em um só lugar.',
    caption: `Perder aluno quase nunca é surpresa. Os sinais aparecem antes. 👀\nSalve este post e confira com seus alunos hoje.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'ao-vivo', kind: 'print', print: 'ao-vivo', headline: 'Registre cada série na hora', sub: 'Treino ao vivo, sem papel.',
    caption: `Cada série registrada vira evolução que dá para ver. 📈\nAluno que enxerga o progresso treina mais motivado.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'retencao', kind: 'slides', headline: 'Como reter alunos por mais tempo',
    slides: [
      ['1', 'Mostre a evolução com números'],
      ['2', 'Dê feedback depois de cada treino'],
      ['3', 'Ajuste a carga antes que ele estagne'],
      ['4', 'Esteja presente, mesmo à distância'],
    ],
    closing: 'Tudo isso num só app.',
    caption: `Reter aluno custa menos do que conquistar um novo. 💡\nSalve este post e aplique ainda esta semana.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'historico', kind: 'print', print: 'historico', headline: 'Todo o histórico num só lugar', sub: 'Treinos, cargas e datas sempre à mão.',
    caption: `Chega de perguntar “quanto foi que você fez semana passada?”. 🧠\nO histórico completo de cada treino fica no app.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'nutricao', kind: 'print', print: 'nutricao', headline: 'Treino e alimentação juntos', sub: 'Calorias e macros no mesmo app.',
    caption: `Resultado vem do treino e da comida. 🍽️\nNo app, o aluno acompanha as duas coisas num só lugar.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'agua', kind: 'print', print: 'agua', headline: 'Meta de água em dia', sub: 'Um hábito simples que muda o treino.',
    caption: `Hidratação também é treino. 💧\nO app lembra e registra a meta diária de água.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  // Terceira leva (migration 20270108010000): telas novas do app, para quem treina.
  // Os stories em vídeo destes temas saem do marketing-stories.mjs (NEW_GENERAL).
  {
    key: 'musculos', kind: 'print', print: 'musculos', headline: 'Qual músculo ficou para trás?', sub: 'O app mostra o volume da semana de cada músculo.',
    caption: `Peito em dia e posterior esquecido? 👀\nO app conta as séries da semana de cada músculo e mostra o que está ficando para trás.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'carga', kind: 'print', print: 'carga', headline: 'Sua carga subindo, semana a semana', sub: 'Escolha o exercício e veja a evolução.',
    caption: `Lembra quanto você pegava no agachamento mês passado? 📈\nNo app, cada exercício tem o gráfico da sua carga ao longo das semanas.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'consistencia', kind: 'print', print: 'consistencia', headline: 'Constância que dá para ver', sub: 'Os últimos 35 dias de treino num só quadro.',
    caption: `Resultado é constância. 🔥\nO app mostra cada dia treinado e quantos treinos você fez por semana. Dá vontade de não quebrar a sequência.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'recordes', kind: 'print', print: 'recordes', headline: 'Seus recordes, todos anotados', sub: 'Maior carga e 1RM estimado de cada exercício.',
    caption: `Bateu recorde no leg press? 🏆\nO app guarda a maior carga de cada exercício e estima o seu 1RM, sem planilha.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'corpo', kind: 'print', print: 'corpo', headline: 'Peso e medidas no mesmo lugar', sub: 'Acompanhe o corpo mudando, mês a mês.',
    caption: `A balança não conta tudo. 📏\nRegistre peso e medidas (cintura, quadril, braço, coxa) e veja a evolução em gráfico.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'progressao', kind: 'print', print: 'progressao', headline: 'O app sugere a carga de hoje', sub: 'Com base no que você fez no último treino.',
    caption: `Subo a carga ou repito? 🤔\nO app olha o seu último treino e sugere a carga e as repetições de hoje, com séries de aquecimento.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'nutricao-macros', kind: 'print', print: 'nutricao-macros', headline: 'Proteína, carbo e gordura num toque', sub: 'Veja quanto falta para a meta do dia.',
    caption: `Bateu a proteína hoje? 🍗\nO app soma as calorias e os macros de cada refeição e mostra quanto falta para a meta.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'nutricao-semana', kind: 'print', print: 'nutricao-semana', headline: 'Quanto você gasta de verdade?', sub: 'O app calcula pelo seu diário e pela balança.',
    caption: `Comendo certo e o peso não muda? ⚖️\nCom o diário alimentar e o seu peso, o app estima o seu gasto real e ajusta a meta de calorias.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  // Quarta leva (migration 20270109010000): modo Personal, para personal trainers.
  // Prints pt-* (alunos fictícios). Os stories em vídeo saem do marketing-stories.mjs (PERSONAL).
  {
    key: 'personal-painel', kind: 'print', print: 'pt-painel', headline: 'Todos os seus alunos num painel', sub: 'Quem treinou, quem sumiu e quem precisa de você hoje.',
    caption: `Começa o dia sabendo quem precisa de você. 📊\nO painel do Personal mostra quem treinou na semana, quem sumiu, quem relatou dor e qual plano está vencendo.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'personal-alunos', kind: 'print', print: 'pt-alunos', headline: 'Cada aluno com a sua aderência', sub: 'Treinos da semana, últimos 14 dias e plano.',
    caption: `Quantos treinos o seu aluno fez essa semana? 🗓️\nNa lista de alunos você vê a aderência de cada um, os últimos 14 dias e quando o plano vence.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'personal-treinos', kind: 'print', print: 'pt-ficha-treinos', headline: 'Veja o que o aluno fez de verdade', sub: 'Cada treino, carga e série, com o que evoluiu.',
    caption: `"Fiz o treino todo, prof." 😅\nNa ficha do aluno você vê cada treino feito: duração, nota, cargas e quantos exercícios evoluíram.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'personal-evolucao', kind: 'print', print: 'pt-ficha-evolucao', headline: 'A evolução do aluno em gráfico', sub: 'Peso, medidas e como ele tem se sentido.',
    caption: `Mostre o resultado, não só fale dele. 📈\nPeso, medidas e o check-in de energia, sono e humor de cada aluno, num gráfico pronto para a reavaliação.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'personal-montar', kind: 'print', print: 'pt-montar-treino', headline: 'Monte e envie o treino pelo app', sub: 'Dias, exercícios, séries e prazo do plano.',
    caption: `Chega de PDF e print de planilha. 📲\nMonte o treino no app (dias, exercícios, séries, descanso e prazo) e ele chega direto no celular do aluno.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'personal-modelos', kind: 'print', print: 'pt-modelos', headline: 'Seus treinos prontos para reusar', sub: 'Salve modelos e envie para vários alunos.',
    caption: `Monta o mesmo treino toda semana? ♻️\nSalve como modelo e envie para um ou vários alunos de uma vez, ajustando só o que muda.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'personal-conversa', kind: 'print', print: 'pt-conversa', headline: 'Recado direto no app do aluno', sub: 'Sem misturar com o seu WhatsApp pessoal.',
    caption: `Seu WhatsApp não precisa ser o canal de treino. 💬\nMande recados e converse com cada aluno pelo app. Ele recebe uma notificação e responde por lá.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'personal-agenda', kind: 'print', print: 'pt-agenda', headline: 'Aulas marcadas e confirmadas', sub: 'O aluno confirma a aula pelo app.',
    caption: `Agenda de aulas sem troca de mensagens. 📅\nMarque a aula presencial ou online e o aluno confirma pelo app. Tudo aparece no seu painel.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'consultoria', kind: 'slides', headline: 'Consultoria online: como acompanhar o aluno de longe',
    slides: [
      ['1', 'Treino no celular do aluno, não em PDF'],
      ['2', 'Veja o que ele fez de verdade: cargas e séries'],
      ['3', 'Um recado curto toda semana'],
      ['4', 'Peso e medidas a cada 30 dias'],
      ['5', 'Ajuste o plano antes de ele vencer'],
    ],
    closing: 'Tudo isso no modo Personal do EAFIT.',
    caption: `Consultoria online não é mandar uma planilha e sumir. 🌐\nSalve estes 5 passos e acompanhe o aluno de longe como se estivesse na academia.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'trocar-treino', kind: 'slides', headline: 'Quando trocar o treino do aluno?',
    slides: [
      ['1', 'A carga está parada há 3 treinos'],
      ['2', 'O plano chegou ao fim: 6 a 8 semanas'],
      ['3', 'Dor ou desconforto no mesmo exercício'],
      ['4', 'Ele faltou a mais da metade dos treinos'],
    ],
    closing: 'O app mostra cada um desses sinais.',
    caption: `Trocar o treino cedo demais atrapalha. Tarde demais, o aluno desanima. 🔄\nOs 4 sinais de que está na hora de mudar.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'primeira-semana', kind: 'slides', headline: 'A primeira semana do aluno novo',
    slides: [
      ['1', 'Convite pelo seu link: ele já entra vinculado a você'],
      ['2', 'Treino enviado no primeiro dia'],
      ['3', 'Meta de treinos por semana combinada'],
      ['4', 'Um recado depois do primeiro treino'],
      ['5', 'No painel, veja quem ainda não treinou'],
    ],
    closing: 'Comece com o modo Personal do EAFIT.',
    caption: `A primeira semana decide se o aluno fica. 👋\nUm roteiro simples para o aluno novo começar bem.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  // Quinta leva (migration 20270110010000): amigos, liga do mês, treinador por voz
  // e temporada. Stories em vídeo no marketing-stories.mjs (RECURSOS).
  {
    key: 'amigos', kind: 'print', print: 'amigos', headline: 'Treine junto com os amigos', sub: 'Ranking da semana por dias treinados.',
    caption: `Com amigo junto fica mais difícil faltar. 👊\nAdicione os amigos pelo código e dispute o ranking da semana: quem treina mais dias fica no topo.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'amigos-atividade', kind: 'print', print: 'amigos-atividade', headline: 'Comemore os recordes dos amigos', sub: 'Treinos, recordes e sequências de quem treina com você.',
    caption: `Seu amigo bateu recorde no agachamento? Manda um 🔥\nNo app você acompanha os treinos, recordes e sequências dos amigos e reage com 💪 🔥 👏. Só aparece quem escolheu compartilhar.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'liga', kind: 'print', print: 'liga', headline: 'Liga do mês: quem treina mais vence', sub: 'Divisões Ouro, Prata e Bronze, com medalha para o top 3.',
    caption: `Todo mês uma liga nova. 🏅\nVocê disputa com quem treina no mesmo ritmo (Ouro, Prata ou Bronze) e os 3 primeiros de cada divisão ganham medalha. No ranking aparece só o seu apelido.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'treinador-voz', kind: 'print', print: 'treinador-voz', headline: 'Um treinador falando no seu ouvido', sub: 'Apresenta os exercícios, conta o descanso e comemora recordes.',
    caption: `Treina de fone? 🎧\nLigue o treinador por voz: ele apresenta cada exercício, conta o descanso e comemora os seus recordes. Escolha o jeito de falar: animado, zoeira ou calmo.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  // Temporada (migration 20270111020000): `season` = tema do app (lib/season.js).
  // A fila só publica enquanto esse tema estiver no ar no app.
  {
    key: 'temporada-novembro-azul', season: 'novembro_azul', kind: 'print', print: 'temporada-novembro-azul', headline: 'Novembro Azul no EAFIT', sub: 'Treino em dia e exames de rotina também.',
    caption: `Novembro Azul: mês de cuidar da saúde do homem. 💙\nTreino em dia e exames de rotina também. No app, treine no período e ganhe a conquista Novembro Azul.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'temporada', season: 'natal', kind: 'print', print: 'temporada-natal', headline: 'Natal no EAFIT', sub: 'Treine no período e ganhe a conquista Treino de Natal.',
    caption: `O app entrou no clima de Natal. 🎄\nTreine no período e ganhe a conquista Treino de Natal. Bora fechar o ano em movimento?\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  {
    key: 'temporada-ano-novo', season: 'ano_novo', kind: 'print', print: 'temporada-ano-novo', headline: 'Comece o ano treinando', sub: 'Treine na primeira semana e ganhe a conquista Ano Novo.',
    caption: `Ano novo, treino em dia. 🎆\nFaça um treino na primeira semana do ano e ganhe a conquista Ano Novo no app.\n\nComece agora. Link na bio 👇\n\n${TAGS}`,
  },
  // Segunda leva (migration 20270101010000): temas novos, nunca publicados antes.
  {
    key: 'erros', later: true, kind: 'slides', headline: '4 erros que fazem o aluno largar o treino',
    slides: [
      ['1', 'Treino igual para todo mundo'],
      ['2', 'Nunca ajustar a carga'],
      ['3', 'Não dar retorno depois do treino'],
      ['4', 'Não mostrar o resultado dele'],
    ],
    closing: 'Corrija isso com o app.',
    caption: `Quase todo aluno que larga o treino passou por um destes quatro erros. ⚠️
Salve e revise a sua rotina com os alunos.

Comece agora. Link na bio 👇

${TAGS}`,
  },
  {
    key: 'checklist', later: true, kind: 'slides', headline: 'Checklist antes de enviar o treino',
    slides: [
      ['1', 'Objetivo do aluno'],
      ['2', 'Nível e lesões'],
      ['3', 'Dias disponíveis na semana'],
      ['4', 'Carga inicial segura'],
    ],
    closing: 'Monte e envie pelo app.',
    caption: `Treino bom começa antes do primeiro exercício. ✅
Salve este checklist para o próximo aluno novo.

Comece agora. Link na bio 👇

${TAGS}`,
  },
];

const FONT = 'Arial, Helvetica, sans-serif';

function background(ctx, w, h) {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#17171b');
  bg.addColorStop(1, '#0e0e12');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * 0.8, h * 0.15, 0, w * 0.8, h * 0.15, w * 0.7);
  glow.addColorStop(0, 'rgba(249,115,22,.35)');
  glow.addColorStop(1, 'rgba(249,115,22,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
}

function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) throw new Error(`Texto longo demais: ${text}`);
  return lines;
}

function footer(ctx, w, h) {
  ctx.fillStyle = '#f97316';
  ctx.font = `700 40px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Comece agora · eafit.com.br', w / 2, h - 80);
}

async function printArt(item, format) {
  const [w, h] = SIZES[format];
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  background(ctx, w, h);
  const pad = 72;
  let y = pad + 40;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.font = `800 68px ${FONT}`;
  for (const line of wrap(ctx, item.headline, w - pad * 2, 2)) { ctx.fillText(line, pad, y); y += 80; }
  ctx.fillStyle = '#a1a1aa';
  ctx.font = `500 36px ${FONT}`;
  for (const line of wrap(ctx, item.sub, w - pad * 2, 2)) { ctx.fillText(line, pad, y + 6); y += 46; }
  const top = y + 40;
  const img = await loadImage(readFileSync(join(PRINTS, `${item.print}.webp`)));
  const bezel = Math.round(w * 0.017);
  const maxH = h - top - 130 - bezel * 2;
  const scale = Math.min((w - pad * 2 - bezel * 2) / img.width, maxH / img.height);
  const iw = img.width * scale;
  const ih = img.height * scale;
  const ix = (w - iw) / 2;
  drawPhone(ctx, img, ix, top + bezel, iw, ih, { bezel });
  footer(ctx, w, h);
  return canvas.toBuffer('image/jpeg', 90);
}

function slideArt(lines, { big = false, number = null, small = '' } = {}) {
  const [w, h] = SIZES.feed;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  background(ctx, w, h);
  const pad = 90;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  if (number) {
    ctx.fillStyle = '#f97316';
    ctx.font = `800 260px ${FONT}`;
    ctx.fillText(number, pad, 250);
  }
  ctx.fillStyle = '#fff';
  const size = big ? 84 : 76;
  ctx.font = `800 ${size}px ${FONT}`;
  const wrapped = wrap(ctx, lines, w - pad * 2, 5);
  let y = number ? 600 : 420;
  for (const line of wrapped) { ctx.fillText(line, pad, y); y += size + 18; }
  if (small) {
    ctx.fillStyle = '#a1a1aa';
    ctx.font = `500 40px ${FONT}`;
    ctx.fillText(small, pad, y + 30);
  }
  footer(ctx, w, h);
  return canvas.toBuffer('image/jpeg', 90);
}

const sqlText = (s) => `'${s.replace(/'/g, "''")}'`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const rows = [];
  const laterRows = [];
  let position = 0;
  let laterPosition = 18;
  const add = (format, item, files) => {
    position += 1;
    const media = files.map((f) => ({ type: 'image', url: `${SITE}/img/marketing/${f}` }));
    rows.push(`  (${position}, ${sqlText(`${item.key}-${format}`)}, ${sqlText(format)}, ${sqlText(format === 'story' ? '' : item.caption)}, ${sqlText(JSON.stringify(media))}::jsonb)`);
  };

  for (const item of ITEMS) {
    if (item.later) {
      const files = [];
      const cover = `${item.key}-1.jpg`;
      writeFileSync(join(OUT, cover), slideArt(item.headline, { big: true, small: 'Deslize →' }));
      files.push(cover);
      item.slides.forEach(([n, text], i) => {
        const f = `${item.key}-${i + 2}.jpg`;
        writeFileSync(join(OUT, f), slideArt(text, { number: n }));
        files.push(f);
      });
      const last = `${item.key}-${item.slides.length + 2}.jpg`;
      writeFileSync(join(OUT, last), await printArt({ headline: item.closing, sub: 'Comece agora. Link na bio.', print: 'criar-conta' }, 'feed'));
      files.push(last);
      laterPosition += 1;
      const media = files.map((f) => ({ type: 'image', url: `${SITE}/img/marketing/${f}` }));
      laterRows.push(`  (${laterPosition}, ${sqlText(`${item.key}-feed`)}, 'feed', ${sqlText(item.caption)}, ${sqlText(JSON.stringify(media))}::jsonb)`);
      continue;
    }
    if (item.kind === 'print') {
      const feedFile = `${item.key}-feed.jpg`;
      const storyFile = `${item.key}-story.jpg`;
      writeFileSync(join(OUT, feedFile), await printArt(item, 'feed'));
      writeFileSync(join(OUT, storyFile), await printArt(item, 'story'));
      add('feed', item, [feedFile]);
      add('story', item, [storyFile]);
    } else {
      const files = [];
      const cover = `${item.key}-1.jpg`;
      writeFileSync(join(OUT, cover), slideArt(item.headline, { big: true, small: 'Deslize →' }));
      files.push(cover);
      item.slides.forEach(([n, text], i) => {
        const f = `${item.key}-${i + 2}.jpg`;
        writeFileSync(join(OUT, f), slideArt(text, { number: n }));
        files.push(f);
      });
      const last = `${item.key}-${item.slides.length + 2}.jpg`;
      writeFileSync(join(OUT, last), await printArt({ headline: item.closing, sub: 'Comece agora. Link na bio.', print: 'criar-conta' }, 'feed'));
      files.push(last);
      add('feed', item, files);
    }
  }
  writeFileSync(join(root, 'supabase', 'migrations', '20261230010000_marketing_autopost.seed.sql.txt'), rows.join(',\n') + ';\n');
  writeFileSync(join(root, 'supabase', 'migrations', '20270101010000_marketing_autopost_dedup.later.sql.txt'), laterRows.join(',\n') + ';\n');
  console.log(`${position} itens, artes em ${OUT}`);
}

main();
