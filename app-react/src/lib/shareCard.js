import { formatDuration } from './utils';
import { formatMinutes } from './monthlyRecap';
import { SHARE_CARD_URL } from './links';
import { getMuscleGroupsForDay } from '../data/treinoData';
import { FRONT_MUSCLE_PATHS, BACK_MUSCLE_PATHS, BODY_VIEW_SIZE, MUSCLE_LABELS } from '../data/bodyMuscleMap';
import bodyAnatomyImg from '../assets/anatomia.jpg';

// Desenha os cards de compartilhamento num canvas offscreen (mesmo padrão de canvas
// usado em lib/imageUtils.js para compressão de imagem) e retorna um Blob PNG pronto
// pra compartilhar ou baixar.
// 9:16 — mesma proporção do Status do WhatsApp e dos Stories do Instagram,
// pra imagem preencher a tela toda ao compartilhar em vez de sobrar borda.
const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1920;
const PAD_X = 56;
const CONTENT_W = CARD_WIDTH - PAD_X * 2;

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const ORANGE = '#f97316';
const ORANGE_LIGHT = '#fb923c';
const SKY = '#38bdf8';
const EMERALD = '#34d399';
const VIOLET = '#a78bfa';
const MUTED = 'rgba(255,255,255,0.62)';

// Tamanho real (em pixels) de cada metade de anatomia.jpg — diferente de
// BODY_VIEW_SIZE, que é só o espaço de coordenadas usado pelos paths de músculo.
const BODY_IMG_HALF_SIZE = { width: 350, height: 615 };

const BODY_BOX_W = 196;
const BODY_BOX_H = Math.round((BODY_BOX_W * BODY_VIEW_SIZE.height) / BODY_VIEW_SIZE.width);
const BODY_BOX_GAP = 24;
const MUSCLE_FILL = 'rgba(249,115,22,0.6)';
const MUSCLE_STROKE = 'rgba(251,146,60,0.95)';

function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// Espaçamento entre letras (títulos em caixa alta): nem todo navegador tem.
function setTracking(ctx, px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
}

// ctx.roundRect() não existe no Firefox < 112 nem no Safari < 16, então o caminho
// arredondado é montado manualmente em vez de depender da API nativa.
function roundedRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawGlow(ctx, x, y, radius, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, withAlpha(color, alpha));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

// Fundo escuro com brilhos de cor e uma textura diagonal discreta: dá
// profundidade sem competir com o conteúdo.
function drawBackground(ctx, w, h, accent = ORANGE) {
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#16161f');
  base.addColorStop(1, '#09090d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  drawGlow(ctx, w * 0.95, 150, 760, accent, 0.34);
  drawGlow(ctx, w * 0.02, h * 0.58, 700, SKY, 0.10);
  drawGlow(ctx, w * 0.55, h + 40, 900, accent, 0.22);

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 2;
  for (let x = -h; x < w; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + h, 0);
    ctx.stroke();
  }
  ctx.restore();
}

// Cartão translúcido com borda fina (base de todos os blocos).
function drawPanel(ctx, x, y, w, h, radius = 32) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, 'rgba(255,255,255,0.10)');
  g.addColorStop(1, 'rgba(255,255,255,0.04)');
  ctx.fillStyle = g;
  roundedRectPath(ctx, x, y, w, h, radius);
  ctx.fill();
  ctx.restore();

  roundedRectPath(ctx, x, y, w, h, radius);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

// Reduz a fonte até o texto caber na largura.
function fitFont(ctx, text, maxW, startPx, weight, minPx = 28) {
  let px = startPx;
  ctx.font = `${weight} ${px}px ${FONT}`;
  while (px > minPx && ctx.measureText(text).width > maxW) {
    px -= 2;
    ctx.font = `${weight} ${px}px ${FONT}`;
  }
  return px;
}

// Quebra em até `maxLines` linhas, cortando com "…" se ainda passar.
function wrapLines(ctx, text, maxW, maxLines) {
  // "Peito / Ombro / Tríceps": quebra nos separadores, sem deixar a barra solta
  // no fim da linha.
  const parts = String(text).split(/\s*\/\s*/).filter(Boolean);
  const byGroup = parts.length > 1;
  const words = byGroup ? parts : String(text).split(/\s+/).filter(Boolean);
  const sep = byGroup ? ' / ' : ' ';
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line}${sep}${word}` : word;
    if (ctx.measureText(test).width <= maxW || !line) line = test;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.length > 1 && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

function drawStatBox(ctx, x, y, w, h, value, label, accent = ORANGE) {
  drawPanel(ctx, x, y, w, h, 28);

  ctx.save();
  roundedRectPath(ctx, x, y, w, h, 28);
  ctx.clip();
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, 8, h);
  ctx.restore();

  const padX = 36;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  fitFont(ctx, value, w - padX * 2, 68, 800, 34);
  ctx.fillText(value, x + padX, y + h / 2 + 8);

  ctx.font = `700 22px ${FONT}`;
  ctx.fillStyle = MUTED;
  setTracking(ctx, 2.5);
  ctx.fillText(String(label).toUpperCase(), x + padX, y + h / 2 + 52);
  setTracking(ctx, 0);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawCheckBadge(ctx, cx, cy, r) {
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, ORANGE_LIGHT);
  g.addColorStop(1, ORANGE);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = r * 0.22;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.42, cy + r * 0.02);
  ctx.lineTo(cx - r * 0.1, cy + r * 0.34);
  ctx.lineTo(cx + r * 0.44, cy - r * 0.3);
  ctx.stroke();
}

// Logo do app com cantos arredondados (o PNG tem fundo quadrado escuro).
async function drawLogo(ctx, x, y, size) {
  try {
    const icon = await loadImage(`${import.meta.env.BASE_URL}icon-192.png`);
    ctx.save();
    roundedRectPath(ctx, x, y, size, size, size * 0.24);
    ctx.clip();
    ctx.drawImage(icon, x, y, size, size);
    ctx.restore();
    return true;
  } catch {
    return false;
  }
}

// Anel de progresso (meta da semana).
function drawRing(ctx, cx, cy, r, pct, color) {
  ctx.lineWidth = 18;
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  if (pct <= 0) return;
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, ORANGE_LIGHT);
  g.addColorStop(1, color);
  ctx.strokeStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, pct / 100));
  ctx.stroke();
}

function drawWeeklyGoal(ctx, x, y, w, h, weekDone, weekTotal) {
  drawPanel(ctx, x, y, w, h);

  const pct = weekTotal ? Math.min(100, (weekDone / weekTotal) * 100) : 0;
  const reached = weekTotal > 0 && weekDone >= weekTotal;
  const r = 52;
  const cx = x + 40 + r + 9;
  const cy = y + h / 2;
  drawRing(ctx, cx, cy, r, pct, reached ? EMERALD : ORANGE);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 34px ${FONT}`;
  ctx.fillText(`${Math.round(pct)}%`, cx, cy + 12);

  const tx = cx + r + 48;
  ctx.textAlign = 'left';
  ctx.font = `700 22px ${FONT}`;
  ctx.fillStyle = MUTED;
  setTracking(ctx, 2.5);
  ctx.fillText('META DA SEMANA', tx, cy - 30);
  setTracking(ctx, 0);

  ctx.fillStyle = '#ffffff';
  ctx.font = `800 46px ${FONT}`;
  ctx.fillText(`${weekDone} de ${weekTotal} treinos`, tx, cy + 22);

  ctx.font = `600 26px ${FONT}`;
  ctx.fillStyle = reached ? EMERALD : MUTED;
  const faltam = Math.max(0, weekTotal - weekDone);
  ctx.fillText(reached ? 'Meta batida!' : `Faltam ${faltam} para fechar a semana`, tx, cy + 62);
}

// Recorta a metade (frente ou costas) de anatomia.jpg dentro de um box
// arredondado e pinta por cima os mesmos hotspots de músculo do BodyAvatar.
function drawBodyView(ctx, img, x, y, w, h, srcX, paths, activeGroups, label) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = '#e8e8e8';
  roundedRectPath(ctx, x, y, w, h, 22);
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedRectPath(ctx, x, y, w, h, 22);
  ctx.clip();
  ctx.drawImage(img, srcX, 0, BODY_IMG_HALF_SIZE.width, BODY_IMG_HALF_SIZE.height, x, y, w, h);

  ctx.translate(x, y);
  ctx.scale(w / BODY_VIEW_SIZE.width, h / BODY_VIEW_SIZE.height);
  ctx.lineWidth = 3;
  paths.forEach(p => {
    if (!activeGroups.has(p.muscle)) return;
    const path = new Path2D(p.d);
    ctx.fillStyle = MUSCLE_FILL;
    ctx.fill(path);
    ctx.strokeStyle = MUSCLE_STROKE;
    ctx.stroke(path);
  });
  ctx.restore();

  roundedRectPath(ctx, x, y, w, h, 22);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = `700 22px ${FONT}`;
  ctx.fillStyle = MUTED;
  setTracking(ctx, 2.5);
  ctx.fillText(label.toUpperCase(), x + w / 2, y + h + 38);
  setTracking(ctx, 0);
}

// Chips com os nomes dos grupos trabalhados, em fluxo (quebra de linha) até o
// limite de altura; o que não couber vira "+N".
function drawMuscleChips(ctx, x, y, maxW, maxH, activeGroups) {
  const labels = [...activeGroups].map(g => MUSCLE_LABELS[g]).filter(Boolean);
  const chipH = 60;
  const gap = 16;
  ctx.font = `700 29px ${FONT}`;
  ctx.textAlign = 'left';

  let cx = x;
  let cy = y;
  let drawn = 0;
  for (const label of labels) {
    const w = ctx.measureText(label).width + 48;
    if (cx + w > x + maxW) { cx = x; cy += chipH + gap; }
    if (cy + chipH > y + maxH) break;

    ctx.fillStyle = withAlpha(ORANGE, 0.18);
    roundedRectPath(ctx, cx, cy, w, chipH, chipH / 2);
    ctx.fill();
    ctx.strokeStyle = withAlpha(ORANGE_LIGHT, 0.7);
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, cx + 24, cy + chipH / 2 + 10);
    cx += w + gap;
    drawn++;
  }

  const rest = labels.length - drawn;
  if (rest > 0) {
    ctx.fillStyle = MUTED;
    ctx.font = `700 24px ${FONT}`;
    ctx.fillText(`+${rest}`, cx, cy + chipH / 2 + 9);
  }
}

const MUSCLE_PANEL_PAD = 36;
const MUSCLE_PANEL_H = MUSCLE_PANEL_PAD + 44 + 20 + BODY_BOX_H + 52 + MUSCLE_PANEL_PAD - 12;

async function drawMusclesPanel(ctx, x, y, w, day) {
  drawPanel(ctx, x, y, w, MUSCLE_PANEL_H);

  const activeGroups = day ? getMuscleGroupsForDay(day) : new Set();
  const img = await loadImage(bodyAnatomyImg);

  const innerX = x + MUSCLE_PANEL_PAD;
  ctx.textAlign = 'left';
  ctx.font = `700 22px ${FONT}`;
  ctx.fillStyle = ORANGE_LIGHT;
  setTracking(ctx, 2.5);
  ctx.fillText('MÚSCULOS TRABALHADOS', innerX, y + MUSCLE_PANEL_PAD + 24);
  setTracking(ctx, 0);

  const boxY = y + MUSCLE_PANEL_PAD + 44 + 20;
  drawBodyView(ctx, img, innerX, boxY, BODY_BOX_W, BODY_BOX_H, 0, FRONT_MUSCLE_PATHS, activeGroups, 'Frente');
  drawBodyView(ctx, img, innerX + BODY_BOX_W + BODY_BOX_GAP, boxY, BODY_BOX_W, BODY_BOX_H, BODY_IMG_HALF_SIZE.width, BACK_MUSCLE_PATHS, activeGroups, 'Costas');

  const chipsX = innerX + BODY_BOX_W * 2 + BODY_BOX_GAP + 44;
  drawMuscleChips(ctx, chipsX, boxY, x + w - MUSCLE_PANEL_PAD - chipsX, BODY_BOX_H, activeGroups);
}

// Link público que acompanha o card: a landing explica o app pra quem ainda
// não o conhece (a raiz do app abre direto no login).
const SHARE_URL_LABEL = 'elinaldoa.github.io/EAFIT';

export const SHARE_TEXT = `Treino concluído no EAFIT 💪 Monte o seu grátis: ${SHARE_CARD_URL}`;

// Barra de marca no topo: logo + nome à esquerda, data à direita.
async function drawTopBar(ctx, y, dateLabel) {
  const size = 84;
  const hasLogo = await drawLogo(ctx, PAD_X, y, size);
  const textX = PAD_X + (hasLogo ? size + 22 : 0);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 46px ${FONT}`;
  setTracking(ctx, 2);
  ctx.fillText('EAFIT', textX, y + 40);
  ctx.font = `600 24px ${FONT}`;
  ctx.fillStyle = MUTED;
  setTracking(ctx, 0);
  ctx.fillText('Treino & evolução', textX, y + 74);

  if (dateLabel) {
    ctx.textAlign = 'right';
    ctx.font = `700 26px ${FONT}`;
    ctx.fillStyle = MUTED;
    setTracking(ctx, 2);
    ctx.fillText(dateLabel.toUpperCase(), CARD_WIDTH - PAD_X, y + 52);
    setTracking(ctx, 0);
  }
}

// Rodapé: o card circula como imagem solta (status, stories, download), então
// a marca e o endereço do app precisam estar NA imagem.
async function drawFooter(ctx, y, cta) {
  const lineG = ctx.createLinearGradient(PAD_X, 0, CARD_WIDTH - PAD_X, 0);
  lineG.addColorStop(0, withAlpha(ORANGE, 0));
  lineG.addColorStop(0.5, withAlpha(ORANGE, 0.8));
  lineG.addColorStop(1, withAlpha(ORANGE, 0));
  ctx.fillStyle = lineG;
  ctx.fillRect(PAD_X, y, CONTENT_W, 3);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 34px ${FONT}`;
  ctx.fillText(cta, CARD_WIDTH / 2, y + 70);

  const size = 76;
  ctx.font = `900 44px ${FONT}`;
  const nameW = ctx.measureText('EAFIT').width;
  ctx.font = `600 26px ${FONT}`;
  const urlW = ctx.measureText(SHARE_URL_LABEL).width;
  const textW = Math.max(nameW, urlW);
  const groupW = size + 22 + textW;
  const gx = (CARD_WIDTH - groupW) / 2;
  const gy = y + 100;

  const hasLogo = await drawLogo(ctx, gx, gy, size);
  const tx = hasLogo ? gx + size + 22 : gx;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 44px ${FONT}`;
  ctx.fillText('EAFIT', tx, gy + 36);
  ctx.fillStyle = ORANGE_LIGHT;
  ctx.font = `600 26px ${FONT}`;
  ctx.fillText(SHARE_URL_LABEL, tx, gy + 68);
}

function formatCardDate(date = new Date()) {
  return date.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
}

export async function renderWorkoutSummaryCard(summary) {
  const {
    day, durationMs, totalCarga, weekDone, weekTotal,
    exercises = [], totalSetsDone, totalPlannedSets,
  } = summary;

  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, CARD_WIDTH, CARD_HEIGHT);
  await drawTopBar(ctx, 70, formatCardDate());

  // Destaque: o foco do treino em letras grandes (até 2 linhas).
  let y = 250;
  drawCheckBadge(ctx, PAD_X + 24, y - 10, 24);
  ctx.textAlign = 'left';
  ctx.fillStyle = ORANGE_LIGHT;
  ctx.font = `800 30px ${FONT}`;
  setTracking(ctx, 4);
  ctx.fillText('TREINO CONCLUÍDO', PAD_X + 64, y);
  setTracking(ctx, 0);

  const title = String(day?.foco || day?.dia || 'Treino').toUpperCase();
  // Diminui a fonte até o foco caber em 2 linhas sem cortar; só abaixo do
  // mínimo é que ele é abreviado com "…".
  let titlePx = 104;
  let lines;
  for (;;) {
    ctx.font = `900 ${titlePx}px ${FONT}`;
    const full = wrapLines(ctx, title, CONTENT_W, 12);
    if (full.length <= 2 || titlePx <= 52) {
      lines = full.length <= 2 ? full : wrapLines(ctx, title, CONTENT_W, 2);
      break;
    }
    titlePx -= 4;
  }
  ctx.fillStyle = '#ffffff';
  y += 36 + titlePx * 0.95;
  lines.forEach((line, i) => ctx.fillText(line, PAD_X, y + i * titlePx * 1.04));
  y += (lines.length - 1) * titlePx * 1.04;

  ctx.font = `600 34px ${FONT}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(day?.dia || '', PAD_X, y + 56);

  // Números do treino. A folga que sobra quando o título é curto é repartida
  // entre as seções, em vez de empilhar tudo no topo e deixar o fundo vazio.
  const statsGap = 20;
  const statBoxH = 146;
  const goalH = 152;
  const fixedBelow = 56 + 44 + statBoxH * 2 + statsGap + 28 + goalH + 28 + MUSCLE_PANEL_H;
  const footerY = CARD_HEIGHT - 214;
  const spare = Math.max(0, footerY - 40 - (y + fixedBelow));
  const bonus = Math.min(44, Math.floor(spare / 3));

  y += 56 + 44 + bonus;
  const boxW = (CONTENT_W - statsGap) / 2;
  drawStatBox(ctx, PAD_X, y, boxW, statBoxH, formatDuration(durationMs), 'duração', ORANGE);
  drawStatBox(ctx, PAD_X + boxW + statsGap, y, boxW, statBoxH, `${(totalCarga || 0).toLocaleString('pt-BR')} kg`, 'carga total', SKY);
  y += statBoxH + statsGap;
  drawStatBox(ctx, PAD_X, y, boxW, statBoxH, `${totalSetsDone}/${totalPlannedSets}`, 'séries concluídas', EMERALD);
  drawStatBox(ctx, PAD_X + boxW + statsGap, y, boxW, statBoxH, String(exercises.length), 'exercícios', VIOLET);

  y += statBoxH + 28 + bonus;
  drawWeeklyGoal(ctx, PAD_X, y, CONTENT_W, goalH, weekDone, weekTotal);

  y += goalH + 28 + bonus;
  await drawMusclesPanel(ctx, PAD_X, y, CONTENT_W, day);

  await drawFooter(ctx, footerY, 'Monte o seu treino grátis');

  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

// Compartilha a imagem pelo share nativo (quando suporta arquivos) ou baixa.
async function shareImageBlob(blob, filename, title, text) {
  if (!blob) throw new Error('Não foi possível gerar a imagem.');

  const file = new File([blob], filename, { type: 'image/png' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    // Link vai no texto (não em `url`): vários apps descartam `url` quando há
    // arquivo junto, e outros duplicariam o link.
    await navigator.share({ files: [file], title, text });
    return 'shared';
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return 'downloaded';
}

export async function shareWorkoutSummary(summary) {
  const blob = await renderWorkoutSummaryCard(summary);
  return shareImageBlob(blob, 'meu-treino.png', 'Meu treino', SHARE_TEXT);
}

// Cartão 9:16 da retrospectiva do mês (mesmo visual/marca do resumo do treino).
// `recap` vem de buildMonthlyRecap.
export async function renderMonthlyRecapCard(recap) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, CARD_WIDTH, CARD_HEIGHT);
  await drawTopBar(ctx, 70, '');

  ctx.textAlign = 'left';
  ctx.fillStyle = ORANGE_LIGHT;
  ctx.font = `800 30px ${FONT}`;
  setTracking(ctx, 4);
  ctx.fillText('MEU MÊS NO EAFIT', PAD_X, 250);
  setTracking(ctx, 0);

  ctx.fillStyle = '#ffffff';
  fitFont(ctx, String(recap.label).toUpperCase(), CONTENT_W, 100, 900, 56);
  ctx.fillText(String(recap.label).toUpperCase(), PAD_X, 360);

  const statsGap = 22;
  const boxH = 250;
  const boxW = (CONTENT_W - statsGap) / 2;
  const stats = [
    [String(recap.treinos), 'treinos', ORANGE],
    [formatMinutes(recap.minutes), 'de treino', SKY],
    [`${recap.volume.toLocaleString('pt-BR')} kg`, 'volume total', EMERALD],
    [String(recap.prCount), 'recordes batidos', VIOLET],
    [recap.bestStreak ? `${recap.bestStreak} dia(s)` : '—', 'melhor sequência', ORANGE],
    [recap.favWeekday || '—', 'dia favorito', SKY],
  ];
  let y = 430;
  stats.forEach(([value, label, accent], i) => {
    const x = PAD_X + (i % 2) * (boxW + statsGap);
    drawStatBox(ctx, x, y, boxW, boxH, value, label, accent);
    if (i % 2 === 1) y += boxH + statsGap;
  });

  if (recap.deltaPct !== null) {
    // Comparação com o mês anterior em destaque: verde se subiu, laranja se caiu.
    const up = recap.deltaPct > 0;
    const down = recap.deltaPct < 0;
    const color = up ? EMERALD : down ? ORANGE : SKY;
    const panelH = 150;
    drawPanel(ctx, PAD_X, y + 6, CONTENT_W, panelH);

    ctx.textAlign = 'left';
    ctx.fillStyle = color;
    ctx.font = `900 76px ${FONT}`;
    const pctText = `${up ? '+' : down ? '-' : ''}${Math.abs(recap.deltaPct)}%`;
    ctx.fillText(pctText, PAD_X + 44, y + 6 + panelH / 2 + 26);
    const pctW = ctx.measureText(pctText).width;

    ctx.fillStyle = '#ffffff';
    ctx.font = `700 34px ${FONT}`;
    ctx.fillText('de treinos', PAD_X + 44 + pctW + 32, y + 6 + panelH / 2 - 2);
    ctx.fillStyle = MUTED;
    ctx.font = `600 28px ${FONT}`;
    ctx.fillText('em relação ao mês anterior', PAD_X + 44 + pctW + 32, y + 6 + panelH / 2 + 38);
  }

  await drawFooter(ctx, CARD_HEIGHT - 214, 'Monte o seu treino grátis');

  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

export async function shareMonthlyRecap(recap) {
  const blob = await renderMonthlyRecapCard(recap);
  return shareImageBlob(blob, 'meu-mes-eafit.png', 'Meu mês no EAFIT', `Meu mês no EAFIT 💪 Monte o seu grátis: ${SHARE_CARD_URL}`);
}
