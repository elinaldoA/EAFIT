// Quadros do Reel: gancho em texto → print do app entrando com o título →
// chamada para o link da bio. Só usa a API de canvas 2D, então roda igual no
// navegador (gerador do painel) e no Node (scripts/marketing-reels.mjs, com
// @napi-rs/canvas).
export const W = 1080;
export const H = 1920;
export const FPS = 24;
export const DURATION = 12;
export const FONT = 'Arial, Helvetica, sans-serif';

export const clamp = (v) => Math.min(1, Math.max(0, v));
export const easeOut = (v) => 1 - (1 - clamp(v)) ** 3;
// Aparece em [a, a+0.5] e some em [b-0.4, b].
const fade = (t, a, b) => clamp((t - a) / 0.5) * clamp((b - t) / 0.4);

export function background(ctx) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#17171b');
  bg.addColorStop(1, '#0e0e12');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.8, H * 0.12, 0, W * 0.8, H * 0.12, W * 0.9);
  glow.addColorStop(0, 'rgba(249,115,22,.35)');
  glow.addColorStop(1, 'rgba(249,115,22,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

function lines(ctx, text, maxWidth) {
  const out = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) { out.push(line); line = word; } else line = next;
  }
  if (line) out.push(line);
  return out;
}

export function text(ctx, str, { x, y, size, weight = 800, color = '#fff', align = 'left', alpha = 1, maxWidth = W - 144, gap = 1.15 }) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  let yy = y;
  for (const line of lines(ctx, str, maxWidth)) {
    ctx.fillText(line, x, yy);
    yy += size * gap;
  }
  ctx.restore();
  return yy;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawReelFrame(ctx, reel, img, t) {
  background(ctx);

  // Cena 1 (0–3,6 s): gancho.
  const a1 = fade(t, 0.15, 3.6);
  if (a1 > 0) {
    const dy = (1 - easeOut((t - 0.15) / 0.7)) * 60;
    text(ctx, reel.hook, { x: W / 2, y: 700 + dy, size: 96, align: 'center', alpha: a1 });
  }

  // Cena 2 (3,4–9,8 s): título e print do app entrando de baixo.
  const a2 = fade(t, 3.4, 9.8);
  if (a2 > 0) {
    const y = text(ctx, reel.title, { x: 72, y: 130, size: 78, alpha: a2 });
    text(ctx, reel.sub, { x: 72, y: y + 8, size: 42, weight: 500, color: '#a1a1aa', alpha: a2 });
    const top = 440;
    const maxH = H - top - 190;
    const slide = easeOut((t - 3.5) / 0.9);
    const zoom = 1 + 0.05 * clamp((t - 4.4) / 5);
    const base = Math.min((W - 144) / img.width, maxH / img.height);
    const iw = img.width * base * zoom;
    const ih = img.height * base * zoom;
    const ix = (W - iw) / 2;
    const iy = top + (1 - slide) * 700;
    ctx.save();
    ctx.globalAlpha = a2;
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.shadowBlur = 50;
    roundRect(ctx, ix, iy, iw, ih, 40);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = a2;
    roundRect(ctx, ix, iy, iw, ih, 40);
    ctx.clip();
    ctx.drawImage(img, ix, iy, iw, ih);
    ctx.restore();
  }

  // Cena 3 (9,6–12 s): chamada.
  const a3 = clamp((t - 9.6) / 0.5);
  if (a3 > 0) {
    ctx.save();
    ctx.globalAlpha = a3;
    ctx.fillStyle = '#0e0e12';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    const dy = (1 - easeOut((t - 9.7) / 0.6)) * 50;
    text(ctx, 'Conheça o app', { x: W / 2, y: 640 + dy, size: 104, align: 'center', alpha: a3 });
    text(ctx, 'Link na bio', { x: W / 2, y: 840 + dy, size: 64, weight: 600, color: '#a1a1aa', align: 'center', alpha: a3 });
    text(ctx, 'eafit.com.br', { x: W / 2, y: 1000 + dy, size: 72, weight: 700, color: '#f97316', align: 'center', alpha: a3 });
  }
}

// ---------- stories em vídeo ----------
// Uma cena só, de 8 s: etiqueta (ex.: CAFÉ DA MANHÃ), título, subtítulo e o print
// do app entrando de baixo, com o endereço do site no rodapé.
export const STORY_DURATION = 8;

export function drawStoryFrame(ctx, story, img, t) {
  background(ctx);
  const out = clamp((STORY_DURATION - t) / 0.4); // some nos últimos 0,4 s
  const pad = 72;
  let y = 120;

  if (story.pill) {
    const a = clamp((t - 0.15) / 0.4) * out;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `800 36px ${FONT}`;
    const w = ctx.measureText(story.pill).width + 56;
    ctx.fillStyle = '#f97316';
    roundRect(ctx, pad, y, w, 68, 34);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(story.pill, pad + 28, y + 36);
    ctx.restore();
    y += 108;
  }

  const rise = (1 - easeOut((t - 0.4) / 0.7)) * 50;
  y = text(ctx, story.title, { x: pad, y: y + rise, size: 84, alpha: clamp((t - 0.4) / 0.5) * out });
  if (story.sub) {
    text(ctx, story.sub, { x: pad, y: y + 10, size: 42, weight: 500, color: '#a1a1aa', alpha: clamp((t - 0.9) / 0.5) * out });
  }

  const top = 560;
  const maxH = H - top - 190;
  const slide = easeOut((t - 1.2) / 0.9);
  const zoom = 1 + 0.04 * clamp((t - 2) / 6);
  const base = Math.min((W - 144) / img.width, maxH / img.height);
  const iw = img.width * base * zoom;
  const ih = img.height * base * zoom;
  const ix = (W - iw) / 2;
  const iy = top + (1 - slide) * 800;
  const a = clamp((t - 1.2) / 0.4) * out;
  if (a > 0) {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.shadowBlur = 50;
    roundRect(ctx, ix, iy, iw, ih, 40);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = a;
    roundRect(ctx, ix, iy, iw, ih, 40);
    ctx.clip();
    ctx.drawImage(img, ix, iy, iw, ih);
    ctx.restore();
  }

  text(ctx, 'eafit.com.br', { x: W / 2, y: H - 120, size: 44, weight: 700, color: '#f97316', align: 'center', alpha: clamp((t - 2) / 0.5) * out });
}
