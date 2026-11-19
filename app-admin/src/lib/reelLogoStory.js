// Story de aviso com o LOGO no lugar do celular, feito para dar presença: antes do drop só há o título
// "gritando" e uma luz que cresce; no drop o logo entra vindo grande, com leve giro, flash, ondas de choque
// e tremor; depois ele pulsa na batida, com raios girando atrás. `img` é o icon-512.png (o recorte 60..452
// pega só o quadrado arredondado). story = { top, title, sub, cta }.
import { FONT, H, STORY_BPM, STORY_DROP, STORY_DURATION, W, background, clamp, easeOut, roundRect, text } from './reelRender.js';

const easeOutBack = (v) => { const x = clamp(v) - 1; return 1 + 2.70158 * x ** 3 + 1.70158 * x ** 2; };

function fitSize(ctx, str, weight, maxWidth, maxSize) {
  ctx.font = `${weight} ${maxSize}px ${FONT}`;
  const w = ctx.measureText(str).width;
  return w > maxWidth ? Math.floor(maxSize * (maxWidth / w)) : maxSize;
}

// Texto centrado que "bate" na tela: começa maior e transparente e assenta em ~0,3 s.
function slamText(ctx, str, { y, size, color, t, t0, alpha = 1, weight = 900, maxWidth = W - 120, glow = null }) {
  const k = clamp((t - t0) / 0.3);
  if (k <= 0 || alpha <= 0) return;
  const fs = fitSize(ctx, str, weight, maxWidth, size);
  const scale = 1 + 0.45 * (1 - easeOut(k));
  ctx.save();
  ctx.globalAlpha = Math.min(1, k * 1.6) * alpha;
  ctx.translate(W / 2, y + fs / 2);
  ctx.scale(scale, scale);
  ctx.font = `${weight} ${fs}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 40; }
  ctx.fillStyle = color;
  ctx.fillText(str, 0, 0);
  ctx.restore();
}

export function drawStoryLogoFrame(ctx, story, img, t) {
  const accent = '#f97316';
  const c = '249,115,22';
  const beat = 60 / STORY_BPM;
  const drop = STORY_DROP;
  const after = Math.max(0, t - drop);
  const dropped = t >= drop;
  const pulse = Math.exp(-(t % beat) * 7) * (dropped ? 1 : 0.5);
  const out = clamp((STORY_DURATION - t) / 0.4);
  const cx = W / 2;
  const cy = 860;
  const size = 800;

  background(ctx, c);

  // Tremor curto depois do drop: toda a cena balança e assenta.
  ctx.save();
  if (after > 0 && after < 0.6) {
    const d = (1 - after / 0.6) ** 2 * 16;
    ctx.translate(Math.sin(after * 95) * d, Math.cos(after * 83) * d);
  }

  // Luz no centro: cresce até o drop e fica forte depois.
  const glowR = 380 + (dropped ? 260 : 260 * (t / drop)) + 60 * pulse;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR + 300);
  glow.addColorStop(0, `rgba(${c},${dropped ? 0.5 : 0.18 + 0.3 * (t / drop)})`);
  glow.addColorStop(1, `rgba(${c},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Raios girando atrás do logo (mais rápidos antes do drop).
  const rot = t * (dropped ? 0.35 : 0.9);
  const rays = 18;
  const rayGrad = ctx.createRadialGradient(cx, cy, 60, cx, cy, 1300);
  rayGrad.addColorStop(0, `rgba(${c},${dropped ? 0.3 : 0.14})`);
  rayGrad.addColorStop(1, `rgba(${c},0)`);
  ctx.fillStyle = rayGrad;
  for (let i = 0; i < rays; i += 1) {
    const a0 = rot + (i / rays) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 1300, a0, a0 + (Math.PI * 2) / rays / 2);
    ctx.closePath();
    ctx.fill();
  }

  // Antes do drop: anéis que se fecham sobre o centro a cada batida (tensão).
  if (!dropped) {
    for (let i = 0; i < 2; i += 1) {
      const k = ((t / beat) + i * 0.5) % 1;
      ctx.strokeStyle = `rgba(${c},${0.55 * k})`;
      ctx.lineWidth = 6 + 8 * k;
      ctx.beginPath();
      ctx.arc(cx, cy, 700 * (1 - k) + 140, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Logo: entra no drop vindo grande e com um leve giro; depois pulsa na batida.
  if (dropped) {
    const e = easeOutBack(after / 0.4);
    const s = size * (1 + 1.4 * (1 - e)) * (1 + 0.03 * pulse);
    const lx = -s / 2;
    ctx.save();
    ctx.globalAlpha = clamp(after / 0.12) * out;
    ctx.translate(cx, cy);
    ctx.rotate(-0.16 * (1 - e));
    ctx.shadowColor = `rgba(${c},${0.55 + 0.4 * pulse})`;
    ctx.shadowBlur = 90 + 60 * pulse;
    roundRect(ctx, lx, lx, s, s, s * 0.2);
    ctx.fillStyle = '#18181b';
    ctx.fill();
    ctx.shadowBlur = 0;
    roundRect(ctx, lx, lx, s, s, s * 0.2);
    ctx.clip();
    ctx.drawImage(img, 60, 60, 392, 392, lx, lx, s, s);
    ctx.restore();
  }

  // Títulos gigantes: o de cima bate cedo; o de baixo, junto do logo.
  slamText(ctx, story.top, { y: 130, size: 168, color: '#fff', t, t0: 0.2, alpha: out, glow: `rgba(${c},.6)` });
  slamText(ctx, story.title, { y: 1330, size: 120, color: accent, t, t0: drop + 0.15, alpha: out, glow: `rgba(${c},.7)` });
  if (story.sub) {
    text(ctx, story.sub, { x: W / 2, y: 1500, size: 46, weight: 600, color: '#e4e4e7', align: 'center', alpha: clamp((t - drop - 0.5) / 0.4) * out });
  }

  // Ondas de choque + flash no drop.
  if (t >= drop && t < drop + 0.8) {
    const k = (t - drop) / 0.8;
    for (let i = 0; i < 3; i += 1) {
      const kk = clamp(k - i * 0.12);
      if (kk <= 0) continue;
      ctx.strokeStyle = `rgba(${c},${(1 - kk) * 0.9})`;
      ctx.lineWidth = 18 * (1 - kk) + 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 120 + kk * 1100, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - k) ** 3})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();

  // Chamada de baixo (fora do tremor, para ficar firme).
  const cta = clamp((t - drop - 0.7) / 0.4) * out;
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
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0e0e12';
    ctx.font = `800 40px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(story.cta || 'FIQUE DE OLHO', 0, 3);
    ctx.restore();
    text(ctx, 'eafit.com.br', { x: W / 2, y: by + bh + 26, size: 44, weight: 700, color: '#fff', align: 'center', alpha: cta });
  }
  ctx.fillStyle = accent;
  ctx.fillRect(0, H - 14, W * clamp(t / STORY_DURATION), 14);
}
