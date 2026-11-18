// Arte a partir de um print ou de texto (canvas). (parte de lib/marketing.js, que reexporta tudo).
import { drawPhone } from '../reelRender';

// ---------- arte a partir de um print ----------

export const ART_FORMATS = {
  feed: { w: 1080, h: 1350, label: 'Feed (4:5)' },
  square: { w: 1080, h: 1080, label: 'Quadrado (1:1)' },
  story: { w: 1080, h: 1920, label: 'Stories / Reels (9:16)' },
};

// Quebra o texto em linhas que cabem na largura (no máx. maxLines).
export function wrapLines(measure, text, maxWidth, maxLines = 3) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && measure(next) > maxWidth) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) return lines;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // o site responde com Access-Control-Allow-Origin: *
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não deu para carregar a imagem.'));
    img.src = src;
  });
}

// Print do app centralizado sobre o fundo da marca, com título, subtítulo e o
// endereço do site. Sai em JPEG (o Instagram não aceita WebP).
export async function createArt({ imageUrl, headline, subline, format = 'feed' }) {
  const { w, h } = ART_FORMATS[format];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

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

  const pad = 72;
  let y = pad + 20;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 68px Inter, system-ui, sans-serif';
  for (const line of wrapLines(t => ctx.measureText(t).width, headline, w - pad * 2, 2)) {
    ctx.fillText(line, pad, y);
    y += 80;
  }
  if (subline) {
    ctx.fillStyle = '#a1a1aa';
    ctx.font = '500 36px Inter, system-ui, sans-serif';
    for (const line of wrapLines(t => ctx.measureText(t).width, subline, w - pad * 2, 2)) {
      ctx.fillText(line, pad, y + 6);
      y += 46;
    }
  }

  const footer = 110;
  const top = y + 40;
  const img = await loadImage(imageUrl);
  const bezel = Math.round(w * 0.017);
  const maxH = h - top - footer - bezel * 2;
  const scale = Math.min((w - pad * 2 - bezel * 2) / img.width, maxH / img.height);
  const iw = img.width * scale;
  const ih = img.height * scale;
  const ix = (w - iw) / 2;
  drawPhone(ctx, img, ix, top + bezel, iw, ih, { bezel });

  ctx.fillStyle = '#f97316';
  ctx.font = '700 40px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('eafit.com.br', w / 2, h - footer + 30);

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) throw new Error('Não deu para gerar a arte.');
  return { blob, width: w, height: h };
}

// Arte só com texto (sem print do app): título grande no meio, subtítulo e o endereço do site.
export async function createTextArt({ headline, subline, format = 'story' }) {
  const { w, h } = ART_FORMATS[format];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#17171b');
  bg.addColorStop(1, '#0e0e12');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w * 0.8, h * 0.15, 0, w * 0.8, h * 0.15, w * 0.8);
  glow.addColorStop(0, 'rgba(249,115,22,.35)');
  glow.addColorStop(1, 'rgba(249,115,22,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const pad = 90;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 96px Inter, system-ui, sans-serif';
  const title = wrapLines(t => ctx.measureText(t).width, headline, w - pad * 2, 4);
  ctx.font = '500 48px Inter, system-ui, sans-serif'; // o subtítulo se mede com a fonte dele
  const sub = subline ? wrapLines(t => ctx.measureText(t).width, subline, w - pad * 2, 3) : [];
  const sublineBlock = sub.length * 62;
  let y = Math.round((h - (title.length * 112 + (sub.length ? 40 + sublineBlock : 0))) / 2);
  ctx.fillStyle = '#f97316';
  ctx.fillRect(pad, y - 48, 120, 10);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 96px Inter, system-ui, sans-serif';
  for (const line of title) { ctx.fillText(line, pad, y); y += 112; }
  if (sub.length) {
    y += 40;
    ctx.fillStyle = '#a1a1aa';
    ctx.font = '500 48px Inter, system-ui, sans-serif';
    for (const line of sub) { ctx.fillText(line, pad, y); y += 62; }
  }
  ctx.fillStyle = '#f97316';
  ctx.font = '700 44px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('eafit.com.br', w / 2, h - 200);

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) throw new Error('Não deu para gerar a arte.');
  return { blob, width: w, height: h };
}
