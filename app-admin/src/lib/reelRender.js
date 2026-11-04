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

export function background(ctx, accent = '249,115,22') {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#17171b');
  bg.addColorStop(1, '#0e0e12');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.8, H * 0.12, 0, W * 0.8, H * 0.12, W * 0.9);
  glow.addColorStop(0, `rgba(${accent},.35)`);
  glow.addColorStop(1, `rgba(${accent},0)`);
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
// Uma cena só, de 8 s, no ritmo da trilha eletrônica (128 bpm): etiqueta, título
// que entra palavra por palavra, subtítulo e o print do app que cai na hora do
// "drop" (1,875 s, com flash e onda de choque). Cada `variant` (0 a 5) muda a cor,
// o fundo animado e o enquadramento do print, para stories do mesmo tema não
// ficarem iguais.
export const STORY_DURATION = 8;
export const STORY_BPM = 128;
export const STORY_DROP = 1.875; // um compasso de 4 batidas a 128 bpm

export const STORY_VARIANTS = [
  { name: 'Laranja · listras', accent: '#f97316', motif: 'stripes', layout: 'center' },
  { name: 'Azul · ondas', accent: '#22d3ee', motif: 'rings', layout: 'tilt' },
  { name: 'Verde · grade', accent: '#22c55e', motif: 'grid', layout: 'crop' },
  { name: 'Vermelho · equalizador', accent: '#f43f5e', motif: 'bars', layout: 'center' },
  { name: 'Amarelo · raios', accent: '#facc15', motif: 'rays', layout: 'tilt' },
  { name: 'Roxo · partículas', accent: '#a855f7', motif: 'particles', layout: 'crop' },
];

const rgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',');
const easeOutBack = (v) => {
  const x = clamp(v) - 1;
  return 1 + 2.70158 * x ** 3 + 1.70158 * x ** 2;
};

// Fundo animado de cada variante.
function motif(ctx, v, t, pulse) {
  const c = rgb(v.accent);
  ctx.save();
  if (v.motif === 'stripes') {
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-0.38);
    ctx.fillStyle = `rgba(${c},${0.06 + 0.06 * pulse})`;
    const shift = (t * 300) % 180;
    for (let x = -1800; x < 1800; x += 180) ctx.fillRect(x + shift, -1800, 70, 3600);
  } else if (v.motif === 'rings') {
    ctx.strokeStyle = `rgba(${c},.5)`;
    ctx.lineWidth = 6;
    for (let k = 0; k < 5; k += 1) {
      const r = (((t * 0.7) + k / 5) % 1) * 1000;
      ctx.globalAlpha = (1 - r / 1000) * 0.4;
      ctx.beginPath();
      ctx.arc(W / 2, 1180, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (v.motif === 'grid') {
    const hz = H * 0.5;
    ctx.strokeStyle = `rgba(${c},.28)`;
    ctx.lineWidth = 3;
    for (let i = 0; i < 12; i += 1) {
      const f = (i + ((t * 1.4) % 1)) / 12;
      const y = hz + (H - hz) * f * f;
      ctx.globalAlpha = 0.15 + 0.5 * f;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.3;
    for (let i = -10; i <= 10; i += 1) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + i * 22, hz);
      ctx.lineTo(W / 2 + i * 190, H);
      ctx.stroke();
    }
  } else if (v.motif === 'bars') {
    ctx.fillStyle = `rgba(${c},${0.28 + 0.2 * pulse})`;
    const n = 24;
    const w = W / n;
    for (let i = 0; i < n; i += 1) {
      const h = 50 + (Math.sin(t * 6 + i * 0.8) * 0.5 + 0.5) * 220 * (0.45 + pulse);
      ctx.fillRect(i * w + 6, H - 150 - h, w - 12, h);
    }
  } else if (v.motif === 'rays') {
    ctx.translate(W / 2, 1000);
    ctx.rotate(t * 0.22);
    ctx.fillStyle = `rgba(${c},${0.07 + 0.05 * pulse})`;
    for (let k = 0; k < 14; k += 1) {
      const a = (k / 14) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 2400, Math.sin(a) * 2400);
      ctx.lineTo(Math.cos(a + 0.13) * 2400, Math.sin(a + 0.13) * 2400);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    ctx.fillStyle = `rgba(${c},.5)`;
    for (let i = 0; i < 44; i += 1) {
      const x = (i * 197) % W;
      const y = H - ((t * (90 + (i % 5) * 45) + i * 211) % (H + 80));
      ctx.globalAlpha = 0.18 + 0.25 * ((i % 4) / 3);
      ctx.beginPath();
      ctx.arc(x, y, 4 + (i % 4) * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// Título que entra palavra por palavra (com pulo) e a última palavra na cor da variante.
function kinetic(ctx, str, { x, y, size, t, t0, accent, alpha }) {
  ctx.save();
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const maxWidth = W - 144;
  const space = ctx.measureText(' ').width;
  const words = String(str).split(/\s+/).filter(Boolean);
  const rows = [[]];
  let rowW = 0;
  for (const w of words) {
    const ww = ctx.measureText(w).width;
    if (rows[rows.length - 1].length && rowW + space + ww > maxWidth) { rows.push([]); rowW = 0; }
    rows[rows.length - 1].push({ w, ww });
    rowW += (rowW ? space : 0) + ww;
  }
  let idx = 0;
  let yy = y;
  for (const row of rows) {
    let xx = x;
    for (const word of row) {
      const k = clamp((t - t0 - idx * 0.09) / 0.32);
      if (k > 0) {
        ctx.save();
        ctx.globalAlpha = clamp(k * 1.6) * alpha;
        ctx.translate(xx, yy + size / 2);
        const s = 0.6 + 0.4 * easeOutBack(k);
        ctx.scale(s, s);
        ctx.fillStyle = idx === words.length - 1 ? accent : '#fff';
        ctx.fillText(word.w, 0, 0);
        ctx.restore();
      }
      xx += word.ww + space;
      idx += 1;
    }
    yy += size * 1.12;
  }
  ctx.restore();
  return yy;
}

export function drawStoryFrame(ctx, story, img, t) {
  const v = STORY_VARIANTS[(story.variant || 0) % STORY_VARIANTS.length];
  const c = rgb(v.accent);
  const beat = 60 / STORY_BPM;
  const dropped = t >= STORY_DROP;
  const pulse = Math.exp(-(t % beat) * 7) * (dropped ? 1 : 0.4);
  const out = clamp((STORY_DURATION - t) / 0.4); // some nos últimos 0,4 s
  const pad = 72;
  let y = 120;

  background(ctx, c);
  motif(ctx, v, t, pulse);

  if (story.pill) {
    const a = clamp((t - 0.1) / 0.3) * out;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `800 36px ${FONT}`;
    const w = ctx.measureText(story.pill).width + 56;
    ctx.fillStyle = v.accent;
    roundRect(ctx, pad, y, w, 68, 34);
    ctx.fill();
    ctx.fillStyle = '#0e0e12';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(story.pill, pad + 28, y + 36);
    ctx.restore();
    y += 108;
  }

  y = kinetic(ctx, story.title, { x: pad, y, size: 88, t, t0: 0.25, accent: v.accent, alpha: out });
  // Barra de destaque que cresce embaixo do título.
  ctx.save();
  ctx.globalAlpha = out;
  ctx.fillStyle = v.accent;
  ctx.fillRect(pad, y + 6, 360 * easeOut((t - 0.9) / 0.5) * (1 + 0.08 * pulse), 10);
  ctx.restore();
  if (story.sub) {
    text(ctx, story.sub, { x: pad, y: y + 36, size: 42, weight: 500, color: '#d4d4d8', alpha: clamp((t - 1) / 0.4) * out });
  }

  // O print cai no drop; depois pulsa com a batida.
  const top = 600;
  const maxH = H - top - 330; // sobra espaço embaixo para a chamada do app
  const slide = easeOut((t - 1.0) / 0.85);
  const bump = 1 + 0.018 * pulse + 0.04 * clamp((t - 2) / 6);
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (v.layout === 'crop') { sy = img.height * 0.1; sh = img.height * 0.62; }
  const base = Math.min((W - 144) / sw, maxH / sh);
  const iw = sw * base * bump;
  const ih = sh * base * bump;
  const ix = (W - iw) / 2;
  const iy = top + (1 - slide) * 900 + (maxH - ih) / 2 * (v.layout === 'crop' ? 1 : 0);
  const angle = v.layout === 'tilt' ? (v.motif === 'rings' ? -0.06 : 0.06) * (1 - (1 - slide) * 0.5) : 0;
  const a = clamp((t - 1.0) / 0.3) * out;
  if (a > 0) {
    ctx.save();
    ctx.translate(W / 2, iy + ih / 2);
    ctx.rotate(angle);
    ctx.translate(-W / 2, -(iy + ih / 2));
    ctx.globalAlpha = a;
    ctx.shadowColor = `rgba(${c},${0.35 + 0.4 * pulse})`;
    ctx.shadowBlur = 60 + 40 * pulse;
    roundRect(ctx, ix, iy, iw, ih, 40);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(W / 2, iy + ih / 2);
    ctx.rotate(angle);
    ctx.translate(-W / 2, -(iy + ih / 2));
    ctx.globalAlpha = a;
    roundRect(ctx, ix, iy, iw, ih, 40);
    ctx.clip();
    ctx.drawImage(img, sx, sy, sw, sh, ix, iy, iw, ih);
    ctx.restore();
  }

  // Drop: onda de choque e flash.
  if (t >= STORY_DROP && t < STORY_DROP + 0.7) {
    const k = (t - STORY_DROP) / 0.7;
    ctx.save();
    ctx.strokeStyle = `rgba(${c},${(1 - k) * 0.8})`;
    ctx.lineWidth = 14 * (1 - k) + 2;
    ctx.beginPath();
    ctx.arc(W / 2, top + maxH / 2, 80 + k * 900, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(255,255,255,${0.32 * (1 - k) ** 3})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // Chamada para o app, sempre presente: botão pulsando com a batida + endereço.
  const cta = clamp((t - 0.6) / 0.4) * out;
  if (cta > 0) {
    const bw = 820;
    const bh = 104;
    const by = H - 300;
    ctx.save();
    ctx.globalAlpha = cta;
    ctx.translate(W / 2, by + bh / 2);
    const k = 1 + 0.035 * pulse;
    ctx.scale(k, k);
    ctx.shadowColor = `rgba(${c},${0.5 + 0.4 * pulse})`;
    ctx.shadowBlur = 30 + 30 * pulse;
    roundRect(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
    ctx.fillStyle = v.accent;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0e0e12';
    ctx.font = `800 46px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CONHEÇA O APP · LINK NA BIO', 0, 3);
    ctx.restore();
    text(ctx, 'eafit.com.br', { x: W / 2, y: by + bh + 26, size: 44, weight: 700, color: '#fff', align: 'center', alpha: cta });
  }
  ctx.fillStyle = v.accent;
  ctx.fillRect(0, H - 14, W * clamp(t / STORY_DURATION), 14);
}
