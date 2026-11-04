// Reel com personagem: uma mulher ou um homem (ilustração própria, desenhada em
// canvas) "fala" a chamada, com legenda palavra por palavra e a boca em sincronia,
// depois usa o app (celular com o print e toques na tela) e fecha com a marca EAFIT.
// Só usa a API de canvas 2D: roda igual no Node (scripts) e no navegador.
import { DURATION, FONT, H, W, background, clamp, easeOut, roundRect } from './reelRender.js';

export const PERSONA_DURATION = DURATION;

const LOOKS = {
  woman: {
    skin: '#f1b894', skinShade: '#dd9f7c', hair: '#3a1f12', hairLight: '#5a3320', shirt: '#f97316', shirtDark: '#d9600c',
    lips: '#c2415a', logo: '#ffffff',
  },
  man: {
    skin: '#d99a72', skinShade: '#c0805a', hair: '#1c1410', hairLight: '#33261d', shirt: '#2b2b31', shirtDark: '#1d1d22',
    lips: '#9a4a3c', logo: '#f97316',
  },
};

// ---------- fala ----------
// Divide o texto em palavras com horário (proporcional ao tamanho) dentro de [start, end].
function schedule(str, start, end) {
  const words = String(str).split(/\s+/).filter(Boolean);
  const weight = words.map((w) => w.length + 2);
  const total = weight.reduce((a, b) => a + b, 0);
  let at = start;
  return words.map((w, i) => {
    const dur = ((end - start) * weight[i]) / total;
    const out = { word: w, start: at, end: at + dur };
    at += dur;
    return out;
  });
}

// Abertura da boca (0 a 1) em t: oscila dentro de cada palavra, fecha entre elas.
function mouthAt(t, words) {
  for (const w of words) {
    if (t >= w.start && t < w.end) {
      const p = (t - w.start) / (w.end - w.start);
      const syl = Math.max(1, Math.round((w.word.match(/[aeiouáéíóúâêôãõ]+/gi) || ['a']).length));
      const env = Math.sin(Math.PI * p) ** 0.6;
      return env * (0.35 + 0.65 * Math.abs(Math.sin(p * Math.PI * syl)));
    }
  }
  return 0;
}

// ---------- personagem ----------
function ellipse(ctx, x, y, rx, ry, fill) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

// Busto com a origem no centro da base do tronco; y negativo é para cima.
function drawPerson(ctx, who, t, mouth) {
  const L = LOOKS[who];
  const bob = Math.sin(t * 2.1) * 5;
  const tilt = Math.sin(t * 1.3) * 0.015;
  ctx.save();
  ctx.rotate(tilt);

  // cabelo de trás
  if (who === 'woman') {
    const sway = Math.sin(t * 2.6) * 22;
    ctx.fillStyle = L.hair;
    ctx.beginPath();
    ctx.moveTo(120, -600 + bob);
    ctx.bezierCurveTo(260 + sway, -560, 300 + sway, -380, 215 + sway * 1.6, -250);
    ctx.bezierCurveTo(190 + sway, -330, 150, -420, 110, -470 + bob);
    ctx.closePath();
    ctx.fill();
    ellipse(ctx, 0, -480 + bob, 168, 192, L.hair);
  }

  // tronco
  ctx.fillStyle = L.shirt;
  ctx.beginPath();
  ctx.moveTo(-300, 0);
  ctx.bezierCurveTo(-300, -170, -260, -250, -120, -290);
  ctx.lineTo(120, -290);
  ctx.bezierCurveTo(260, -250, 300, -170, 300, 0);
  ctx.closePath();
  ctx.fill();
  // dobra da gola
  ctx.fillStyle = L.shirtDark;
  ctx.beginPath();
  ctx.moveTo(-95, -292);
  ctx.quadraticCurveTo(0, -215, 95, -292);
  ctx.quadraticCurveTo(0, -262, -95, -292);
  ctx.fill();
  // marca no peito
  ctx.save();
  ctx.fillStyle = L.logo;
  ctx.font = `900 54px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EAFIT', 0, -120);
  ctx.restore();

  // pescoço
  ctx.fillStyle = L.skinShade;
  ctx.fillRect(-48, -340 + bob, 96, 70);
  ctx.fillStyle = L.skin;
  ctx.beginPath();
  ctx.moveTo(-48, -300);
  ctx.quadraticCurveTo(0, -250, 48, -300);
  ctx.lineTo(48, -330);
  ctx.lineTo(-48, -330);
  ctx.fill();

  ctx.save();
  ctx.translate(0, bob);

  // orelhas
  ellipse(ctx, -140, -455, 24, 34, L.skinShade);
  ellipse(ctx, 140, -455, 24, 34, L.skinShade);
  if (who === 'woman') {
    ellipse(ctx, -140, -405, 9, 9, '#facc15');
    ellipse(ctx, 140, -405, 9, 9, '#facc15');
  }

  // rosto
  ellipse(ctx, 0, -470, 140, 168, L.skin);

  // cabelo da frente
  ctx.fillStyle = L.hair;
  ctx.beginPath();
  if (who === 'woman') {
    ctx.moveTo(-150, -470);
    ctx.bezierCurveTo(-170, -640, -40, -690, 30, -672);
    ctx.bezierCurveTo(130, -655, 170, -580, 150, -470);
    ctx.bezierCurveTo(125, -540, 70, -585, 0, -592);
    ctx.bezierCurveTo(-60, -585, -120, -540, -150, -470);
  } else {
    ctx.moveTo(-148, -470);
    ctx.bezierCurveTo(-165, -650, -60, -675, 10, -672);
    ctx.bezierCurveTo(110, -672, 170, -610, 148, -470);
    ctx.bezierCurveTo(130, -540, 100, -565, 40, -572);
    ctx.bezierCurveTo(-20, -560, -90, -560, -148, -470);
  }
  ctx.fill();
  ctx.fillStyle = L.hairLight;
  ctx.beginPath();
  ctx.ellipse(-20, -640, 70, 14, -0.15, 0, Math.PI * 2);
  ctx.globalAlpha = 0.5;
  ctx.fill();
  ctx.globalAlpha = 1;

  // sobrancelhas (sobem um pouco quando fala)
  const brow = mouth * 6;
  ctx.strokeStyle = L.hair;
  ctx.lineCap = 'round';
  ctx.lineWidth = who === 'man' ? 15 : 10;
  ctx.beginPath();
  ctx.moveTo(-90, -538 - brow);
  ctx.quadraticCurveTo(-58, -556 - brow, -24, -540 - brow);
  ctx.moveTo(24, -540 - brow);
  ctx.quadraticCurveTo(58, -556 - brow, 90, -538 - brow);
  ctx.stroke();

  // olhos (piscam a cada ~3,2 s)
  const blink = (t % 3.2) > 3.08 ? 0.12 : 1;
  for (const x of [-56, 56]) {
    ellipse(ctx, x, -492, 22, 26 * blink, '#ffffff');
    ellipse(ctx, x + 2, -490, 12, 15 * blink, '#2a1a14');
    if (blink === 1) ellipse(ctx, x + 6, -496, 4, 4, '#ffffff');
  }
  if (who === 'woman') {
    ctx.strokeStyle = '#2a1a14';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-80, -508); ctx.lineTo(-92, -520);
    ctx.moveTo(-68, -516); ctx.lineTo(-74, -530);
    ctx.moveTo(80, -508); ctx.lineTo(92, -520);
    ctx.moveTo(68, -516); ctx.lineTo(74, -530);
    ctx.stroke();
  }

  // nariz
  ctx.strokeStyle = L.skinShade;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-4, -470);
  ctx.quadraticCurveTo(14, -440, -4, -432);
  ctx.stroke();

  // barba do homem
  if (who === 'man') {
    ctx.fillStyle = L.hair;
    ctx.beginPath();
    ctx.moveTo(-139, -450);
    ctx.bezierCurveTo(-150, -330, -80, -295, 0, -295);
    ctx.bezierCurveTo(80, -295, 150, -330, 139, -450);
    ctx.bezierCurveTo(120, -420, 80, -428, 55, -418);
    ctx.quadraticCurveTo(0, -440, -55, -418);
    ctx.bezierCurveTo(-80, -428, -120, -420, -139, -450);
    ctx.fill();
    ellipse(ctx, 0, -388, 62, 30, L.hair);
  }

  // boca
  const my = -380;
  if (mouth < 0.06) {
    ctx.strokeStyle = who === 'woman' ? L.lips : '#f3d9c8';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(-38, my - 6);
    ctx.quadraticCurveTo(0, my + 24, 38, my - 6);
    ctx.stroke();
  } else {
    const ry = 6 + 21 * mouth;
    const rx = 30 + 6 * mouth;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, my + ry * 0.2, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#4a1414';
    ctx.fillRect(-rx - 4, my - ry - 8, rx * 2 + 8, ry * 2 + 20);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-rx - 4, my - ry - 8, rx * 2 + 8, 18 + ry * 0.25);
    ctx.fillStyle = '#e0626f';
    ctx.beginPath();
    ctx.ellipse(0, my + ry * 1.1, rx * 0.65, ry * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = who === 'woman' ? L.lips : 'rgba(0,0,0,0)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.ellipse(0, my + ry * 0.2, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

// ---------- celular com o app ----------
function drawPhone(ctx, img, cx, cy, w, t, tapAt) {
  const h = w * 2.05;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.05 + Math.sin(t * 1.4) * 0.008);
  ctx.shadowColor = 'rgba(0,0,0,.65)';
  ctx.shadowBlur = 60;
  roundRect(ctx, -w / 2, -h / 2, w, h, 64);
  ctx.fillStyle = '#0a0a0c';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#3f3f46';
  ctx.lineWidth = 6;
  ctx.stroke();
  const pad = 16;
  const sw = w - pad * 2;
  const sh = h - pad * 2;
  ctx.save();
  roundRect(ctx, -sw / 2, -sh / 2, sw, sh, 50);
  ctx.clip();
  ctx.fillStyle = '#000';
  ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
  const scale = Math.max(sw / img.width, sh / img.height);
  const iw = img.width * scale;
  const ih = img.height * scale;
  // o print rola devagar, como quem usa o app
  const drift = Math.max(0, ih - sh) * clamp((t - tapAt) / 5) * 0.5;
  ctx.drawImage(img, -iw / 2, -sh / 2 - drift, iw, ih);
  // toques na tela
  for (let k = 0; k < 3; k += 1) {
    const p = clamp((t - tapAt - 0.6 - k * 1.5) / 0.9);
    if (p > 0 && p < 1) {
      const tx = (-0.2 + k * 0.22) * sw;
      const ty = (-0.05 + (k % 2) * 0.28) * sh;
      ctx.beginPath();
      ctx.arc(tx, ty, 18 + 70 * p, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(249,115,22,${0.9 * (1 - p)})`;
      ctx.lineWidth = 8;
      ctx.stroke();
      ellipse(ctx, tx, ty, 16, 16, `rgba(249,115,22,${0.8 * (1 - p)})`);
    }
  }
  ctx.restore();
  roundRect(ctx, -60, -sh / 2 + 10, 120, 30, 15);
  ctx.fillStyle = '#0a0a0c';
  ctx.fill();
  ctx.restore();
}

// ---------- legenda palavra por palavra ----------
function caption(ctx, words, t, { y, size = 74, alpha = 1 }) {
  ctx.save();
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.textBaseline = 'top';
  const maxW = W - 160;
  const rows = [];
  let row = [];
  let rowW = 0;
  const space = ctx.measureText(' ').width;
  for (const w of words) {
    const ww = ctx.measureText(w.word).width;
    if (row.length && rowW + space + ww > maxW) { rows.push({ row, w: rowW }); row = []; rowW = 0; }
    row.push({ ...w, ww });
    rowW += (row.length > 1 ? space : 0) + ww;
  }
  if (row.length) rows.push({ row, w: rowW });
  const lh = size * 1.25;
  const boxH = rows.length * lh + 56;
  const boxW = Math.max(...rows.map((r) => r.w)) + 80;
  ctx.globalAlpha = alpha * 0.82;
  roundRect(ctx, (W - boxW) / 2, y - 28, boxW, boxH, 44);
  ctx.fillStyle = '#0e0e12';
  ctx.fill();
  ctx.globalAlpha = alpha;
  rows.forEach((r, ri) => {
    let x = (W - r.w) / 2;
    for (const w of r.row) {
      const spoken = t >= w.end;
      const now = t >= w.start && t < w.end;
      ctx.fillStyle = now ? '#f97316' : spoken ? '#ffffff' : 'rgba(255,255,255,.38)';
      ctx.fillText(w.word, x, y + ri * lh);
      x += w.ww + space;
    }
  });
  ctx.restore();
  return y + rows.length * lh + 28;
}

// ---------- quadro ----------
// reel: { who: 'woman' | 'man', line1, line2 }  (line1 = gancho, line2 = explicação)
export function drawPersonaFrame(ctx, reel, img, t) {
  background(ctx);
  const words1 = schedule(reel.line1, 0.3, 3.5);
  const words2 = schedule(reel.line2, 4.0, 9.4);
  const mouth = mouthAt(t, [...words1, ...words2]);

  // marca no topo
  ctx.save();
  ctx.font = `900 46px ${FONT}`;
  const mw = ctx.measureText('EAFIT').width + 64;
  roundRect(ctx, 64, 90, mw, 72, 36);
  ctx.fillStyle = '#f97316';
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText('EAFIT', 96, 128);
  ctx.restore();

  // posição do personagem: grande no centro → pequeno à esquerda → centro no fim
  const toLeft = easeOut((t - 3.6) / 0.9);
  const toEnd = easeOut((t - 9.6) / 0.7);
  const scale = (1.4 - 0.55 * toLeft) + 0.5 * toEnd;
  const px = 540 - 250 * toLeft + 250 * toEnd;
  const py = H + 40 - 40 * toLeft;

  // celular (cena 2)
  const phoneIn = easeOut((t - 3.9) / 0.9);
  const phoneOut = 1 - clamp((t - 9.5) / 0.4);
  if (phoneIn > 0 && phoneOut > 0) {
    ctx.save();
    ctx.globalAlpha = phoneOut;
    drawPhone(ctx, img, 725, 1130 + (1 - phoneIn) * 900, 470, t, 4.4);
    ctx.restore();
  }

  ctx.save();
  ctx.translate(px, py);
  ctx.scale(scale, scale);
  drawPerson(ctx, reel.who, t, mouth);
  ctx.restore();

  // legendas
  const a1 = clamp((t - 0.15) / 0.3) * clamp((3.9 - t) / 0.3);
  if (a1 > 0) caption(ctx, words1, t, { y: 250 + (1 - easeOut((t - 0.15) / 0.5)) * 40, alpha: a1 });
  const a2 = clamp((t - 3.9) / 0.3) * clamp((9.7 - t) / 0.3);
  if (a2 > 0) caption(ctx, words2, t, { y: 250, size: 64, alpha: a2 });

  // fechamento
  const a3 = clamp((t - 9.7) / 0.5);
  if (a3 > 0) {
    const dy = (1 - easeOut((t - 9.8) / 0.6)) * 50;
    ctx.save();
    ctx.globalAlpha = a3;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff';
    ctx.font = `900 100px ${FONT}`;
    ctx.fillText('Conheça o app', W / 2, 260 + dy);
    ctx.fillStyle = '#a1a1aa';
    ctx.font = `600 60px ${FONT}`;
    ctx.fillText('Link na bio', W / 2, 400 + dy);
    ctx.fillStyle = '#f97316';
    ctx.font = `800 72px ${FONT}`;
    ctx.fillText('eafit.com.br', W / 2, 500 + dy);
    ctx.restore();
  }
}
