import { cardKit, coverRect } from '../../lib/shareCard';
import { myRefCode } from '../../lib/myRef';
import { trackFeature } from '../../lib/tracking';
import { t, locale } from '../../lib/i18n';
import { mapView, TILE_SIZE, paceRuns } from './route';
import { tileSrc } from './mapStyle';
import { weatherShort, weatherDetail, tempText } from './weather';
import { periodSummary, periodRuns, periodRange, comparePeriod } from './runSummary';
import { splitsChart, extrasOf, elevRuns, paceKmRuns, LEVEL_COLORS } from './runCardData';
import { weatherBands } from './weatherInsights';
import { goalProgress } from './runReadings';
import { addDays } from '../../lib/pause';
import { runTitle, paceSeconds, formatPace, formatClock, formatKm } from './runs';
import { formatCommunityAmount, communityGoalText } from './runsCommunity';

// Card 9:16 de uma corrida para os stories e o status: mapa com o percurso
// (já sem as pontas e as zonas de privacidade, como foi salvo), distância,
// ritmo e tempo, com a marca EAFIT · Run e o rodapé de sempre.
const {
  CARD_WIDTH, CARD_HEIGHT, PAD_X, CONTENT_W, FONT, ORANGE_LIGHT, MUTED,
  drawBackground, drawPanel, drawStatBox, drawFooter, drawLogo, setTracking, fitFont, roundedRectPath,
  shareImageBlob, cardUrl, formatCardDate,
} = cardKit;

const MAP_Y = 400;
const MAP_H = 860;
// Com o gráfico de ritmo por km o mapa encolhe para dar lugar a ele.
const CHART_MAP_H = 620;
const CHART_H = 270;
// Os blocos do mapa são desenhados 1,5× maiores para os nomes das ruas
// ficarem legíveis no story.
const MAP_SCALE = 1.5;

function loadTile(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Como o traçado é pintado: uma cor só, pelo ritmo de cada trecho ou pela subida
// de cada km. Sem o dado necessário (pontos sem tempo, sem subida por km) volta
// para a cor única.
export const TRACE_MODES = ['laranja', 'ritmo', 'elevacao'];

function traceLevels(run, mode) {
  if (mode === 'ritmo') { const fine = paceRuns(run.route); return fine.length ? fine : paceKmRuns(run.route, run.splits); }
  if (mode === 'elevacao') return elevRuns(run.route, run.splits, run.km_elev);
  return [];
}

// Existe o dado para pintar o percurso desse jeito?
export const canColorTrace = (run, mode) => mode === 'laranja' || traceLevels(run, mode).length > 0;

// Linhas coloridas por nível: contorno por baixo e a cor por cima.
function strokeLevels(ctx, pieces, place, outline, widths = [9, 5]) {
  const line = (pts, color, width) => {
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [px, py] = place(p);
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };
  pieces.forEach(r => line(r.pts, outline, widths[0] + 3));
  pieces.forEach(r => line(r.pts, LEVEL_COLORS[r.level], widths[1]));
}

// Legenda do traçado colorido: faixa de cor com os dois extremos.
function drawTraceLegend(ctx, mode, x, y) {
  const w = 360;
  const h = 78;
  ctx.save();
  roundedRectPath(ctx, x, y, w, h, 20);
  ctx.fillStyle = 'rgba(9,9,13,0.62)';
  ctx.fill();
  const g = ctx.createLinearGradient(x + 24, 0, x + w - 24, 0);
  LEVEL_COLORS.forEach((c, i) => g.addColorStop(i / (LEVEL_COLORS.length - 1), c));
  roundedRectPath(ctx, x + 24, y + 18, w - 48, 14, 7);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.font = `700 22px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(mode === 'ritmo' ? t('mais lento') : t('descida'), x + 24, y + 62);
  ctx.textAlign = 'right';
  ctx.fillText(mode === 'ritmo' ? t('mais rápido') : t('subida'), x + w - 24, y + 62);
  ctx.restore();
}

// opts: mapH (altura do quadro), trace (TRACE_MODES), light (mapa sem escurecer).
async function drawMap(ctx, run, { mapH = MAP_H, trace = 'laranja', light = false, inset = 0 } = {}) {
  const x0 = PAD_X;
  const w = CONTENT_W;
  drawPanel(ctx, x0, MAP_Y, w, mapH, 36);
  // `inset`: faixa de cima ocupada pelos selos; o percurso desce para não ficar embaixo deles.
  const k = inset / MAP_SCALE / 2;
  const view = mapView(run.route, w / MAP_SCALE, mapH / MAP_SCALE, 40 + k, { pan: [0, -k] });
  if (!view) return false;

  ctx.save();
  roundedRectPath(ctx, x0, MAP_Y, w, mapH, 36);
  ctx.clip();
  ctx.translate(x0, MAP_Y);
  ctx.scale(MAP_SCALE, MAP_SCALE);
  const tiles = await Promise.all(view.tiles.map(tile => loadTile(tileSrc(tile)).then(img => ({ tile, img }))));
  let loaded = 0;
  for (const { tile, img } of tiles) {
    if (!img) continue;
    loaded++;
    ctx.drawImage(img, tile.left, tile.top, TILE_SIZE, TILE_SIZE);
  }
  // Escurece o mapa claro, como no Strava, para o traçado saltar aos olhos.
  // No mapa claro fica como veio, só com um véu leve.
  if (loaded) {
    ctx.fillStyle = light ? 'rgba(255,255,255,0.12)' : 'rgba(9,9,13,0.45)';
    ctx.fillRect(0, 0, w / MAP_SCALE, mapH / MAP_SCALE);
  }

  const line = (pts, color, width) => {
    ctx.beginPath();
    pts.forEach((p, i) => {
      const [px, py] = view.place(p);
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };
  const pieces = traceLevels(run, trace);
  const outline = light ? 'rgba(9,9,13,0.85)' : 'rgba(255,255,255,0.95)';
  if (pieces.length) {
    strokeLevels(ctx, pieces, view.place, outline);
  } else {
    // Traçado numa cor só: brilho, contorno e a linha laranja por cima.
    const segs = run.route.filter(seg => Array.isArray(seg) && seg.length >= 2);
    ctx.save();
    ctx.shadowColor = 'rgba(252,76,2,0.85)';
    ctx.shadowBlur = 14;
    segs.forEach(seg => line(seg, 'rgba(252,76,2,0.55)', 9));
    ctx.restore();
    segs.forEach(seg => line(seg, outline, 8));
    segs.forEach(seg => line(seg, '#fc4c02', 5));
  }

  const dot = ([px, py], color) => {
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  };
  dot(view.start, '#22c55e');
  dot(view.end, '#ef4444');
  ctx.textBaseline = 'alphabetic';
  ctx.restore();

  if (pieces.length) drawTraceLegend(ctx, trace, x0 + 24, MAP_Y + mapH - 24 - 78);
  // Atribuição exigida pelo OpenStreetMap.
  if (loaded) {
    ctx.textAlign = 'right';
    ctx.font = `600 20px ${FONT}`;
    ctx.fillStyle = light ? 'rgba(9,9,13,0.8)' : 'rgba(255,255,255,0.75)';
    ctx.fillText('© OpenStreetMap', x0 + w - 24, MAP_Y + mapH - 22);
  }
  return true;
}

// Sem percurso (corrida sem GPS ou curta demais): a distância no lugar do mapa.
function drawBigDistance(ctx, run, mapH = MAP_H) {
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  fitFont(ctx, formatKm(run.distance_m), CONTENT_W - 60, 260, 900, 120);
  ctx.fillText(formatKm(run.distance_m), CARD_WIDTH / 2, MAP_Y + mapH / 2 + 50);
  ctx.font = `800 50px ${FONT}`;
  ctx.fillStyle = ORANGE_LIGHT;
  setTracking(ctx, 6);
  ctx.fillText('KM', CARD_WIDTH / 2, MAP_Y + mapH / 2 + 150);
  setTracking(ctx, 0);
}

// Selos de recorde e conquista (runCardData.badgesFor) no canto de cima do quadro.
function drawBadges(ctx, badges, x, y, maxW) {
  let top = y;
  ctx.textAlign = 'left';
  for (const b of (badges || []).slice(0, 3)) {
    const text = `${b.icon} ${b.text}`;
    fitFont(ctx, text, maxW - 48, 30, 800, 20);
    const w = Math.min(maxW, ctx.measureText(text).width + 48);
    roundedRectPath(ctx, x, top, w, 58, 29);
    ctx.fillStyle = 'rgba(252,76,2,0.94)';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x + 24, top + 39);
    top += 58 + 12;
  }
}

// Gráfico do ritmo de cada km (o mais rápido em laranja) com o perfil de
// altitude por trás, quando a corrida tem a subida por km, e subida e cadência
// na base. `plain`: sem painel (fundo transparente).
function drawSplitsChart(ctx, chart, extras, x, y, w, h, plain) {
  if (!plain) drawPanel(ctx, x, y, w, h, 28);
  const left = x + 36;
  const right = x + w - 36;
  ctx.textAlign = 'left';
  ctx.fillStyle = ORANGE_LIGHT;
  ctx.font = `800 26px ${FONT}`;
  setTracking(ctx, 3);
  ctx.fillText(t('RITMO POR KM'), left, y + 52);
  setTracking(ctx, 0);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText(t('⚡ Km mais rápido: {v1} (km {v2})', { v1: formatPace(chart.best.sec), v2: chart.best.km }), right, y + 52);

  const n = chart.bars.length;
  const top = y + 92;
  const base = y + 196;
  const areaH = base - top;
  const gap = n > 24 ? 2 : n > 12 ? 5 : 10;
  const bw = (right - left - gap * (n - 1)) / n;
  const cx = i => left + i * (bw + gap) + bw / 2;

  if (chart.alt) {
    const lo = Math.min(...chart.alt);
    const span = Math.max(...chart.alt) - lo;
    const py = a => base - 8 - ((a - lo) / span) * (areaH - 16);
    ctx.beginPath();
    ctx.moveTo(left, base);
    chart.alt.forEach((a, i) => ctx.lineTo(left + (i / n) * (right - left), py(a)));
    ctx.lineTo(right, base);
    ctx.closePath();
    ctx.fillStyle = 'rgba(56,189,248,0.2)';
    ctx.fill();
    ctx.beginPath();
    chart.alt.forEach((a, i) => {
      const px = left + (i / n) * (right - left);
      if (i) ctx.lineTo(px, py(a)); else ctx.moveTo(px, py(a));
    });
    ctx.strokeStyle = 'rgba(56,189,248,0.9)';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  const step = n <= 10 ? 1 : n <= 20 ? 2 : 5;
  chart.bars.forEach((b, i) => {
    const bh = Math.max(8, b.h * areaH);
    roundedRectPath(ctx, cx(i) - bw / 2, base - bh, bw, bh, Math.min(8, bw / 2));
    ctx.fillStyle = b.best ? ORANGE_LIGHT : 'rgba(255,255,255,0.78)';
    ctx.fill();
    ctx.textAlign = 'center';
    if (n <= 10) {
      ctx.font = `700 21px ${FONT}`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(formatPace(b.sec), cx(i), base - bh - 8);
    }
    if (i % step === 0) {
      ctx.font = `600 22px ${FONT}`;
      ctx.fillStyle = MUTED;
      ctx.fillText(String(b.km), cx(i), base + 30);
    }
  });

  if (extras.length) {
    ctx.textAlign = 'left';
    ctx.font = `700 25px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(extras.join('   ·   '), left, y + h - 14);
  }
}

// Subida e cadência numa linha, para quando não há gráfico.
function drawExtrasLine(ctx, extras, y) {
  if (!extras.length) return;
  ctx.textAlign = 'center';
  ctx.font = `700 28px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(extras.join('   ·   '), CARD_WIDTH / 2, y);
}

// Números soltos, sem caixa (cartão de fundo transparente).
function drawPlainStats(ctx, stats, y) {
  const colW = CONTENT_W / stats.length;
  stats.forEach(([value, label], i) => {
    const cx = PAD_X + colW * (i + 0.5);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    fitFont(ctx, value, colW - 16, 88, 900, 36);
    ctx.fillText(value, cx, y + 90);
    ctx.font = `700 25px ${FONT}`;
    ctx.fillStyle = MUTED;
    setTracking(ctx, 2.5);
    ctx.fillText(String(label).toUpperCase(), cx, y + 140);
    setTracking(ctx, 0);
  });
}

// Topo: marca + data.
async function drawBrandBar(ctx, run, label = t('Corrida')) {
  const size = 84;
  const y = 70;
  const hasLogo = await drawLogo(ctx, PAD_X, y, size);
  const tx = PAD_X + (hasLogo ? size + 22 : 0);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 46px ${FONT}`;
  setTracking(ctx, 2);
  ctx.fillText('EAFIT', tx, y + 40);
  const brandW = ctx.measureText('EAFIT').width;
  ctx.fillStyle = ORANGE_LIGHT;
  ctx.fillText(' · Run', tx + brandW, y + 40);
  setTracking(ctx, 0);
  ctx.font = `600 24px ${FONT}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(label, tx, y + 74);
  const when = run.started_at ? new Date(run.started_at) : new Date(`${run.run_date}T12:00:00`);
  ctx.textAlign = 'right';
  ctx.font = `700 26px ${FONT}`;
  setTracking(ctx, 2);
  ctx.fillText(formatCardDate(when).toUpperCase(), CARD_WIDTH - PAD_X, y + 44);
  setTracking(ctx, 0);
  // Clima do começo da corrida (quando foi salvo): "☀️ 24°C" sob a data.
  const wx = weatherShort(run.weather);
  if (wx) {
    ctx.font = `700 30px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(wx, CARD_WIDTH - PAD_X, y + 82);
    const detail = weatherDetail(run.weather);
    if (detail) {
      ctx.font = `600 24px ${FONT}`;
      ctx.fillStyle = MUTED;
      ctx.fillText(detail, CARD_WIDTH - PAD_X, y + 114);
    }
  }
}

// Card 9:16 da corrida. opts (todos opcionais):
//   style  'mapa' (padrão, cai para a distância sem percurso) ou 'numeros'
//   trace  como pintar o percurso (TRACE_MODES): 'laranja', 'ritmo' ou 'elevacao'
//   bg     'escuro' (padrão), 'claro' (mapa claro) ou 'transparente' (PNG sem fundo, para pôr sobre a sua foto)
//   badges selos de recorde e conquista (runCardData.badgesFor); sem isso usa run.badges
// Com 2 km ou mais ganha o gráfico de ritmo por km (com a subida e a cadência).
export async function renderRunCard(run, refCode = myRefCode(), opts = {}) {
  const { style = 'mapa', trace = 'laranja', bg = 'escuro' } = opts;
  const badges = opts.badges ?? run.badges ?? [];
  const plain = bg === 'transparente';
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (plain) {
    // Sem fundo nem caixas: a sombra mantém o texto legível sobre qualquer foto.
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 16;
  } else drawBackground(ctx, CARD_WIDTH, CARD_HEIGHT);
  const panel = (...a) => { if (!plain) drawPanel(ctx, ...a); };

  await drawBrandBar(ctx, run);

  ctx.textAlign = 'left';
  ctx.fillStyle = ORANGE_LIGHT;
  ctx.font = `800 30px ${FONT}`;
  setTracking(ctx, 4);
  ctx.fillText(t('MINHA CORRIDA'), PAD_X, 250);
  setTracking(ctx, 0);
  const title = runTitle(run);
  ctx.fillStyle = '#ffffff';
  fitFont(ctx, title, CONTENT_W, 76, 900, 44);
  ctx.fillText(title, PAD_X, 345);

  const chart = splitsChart(run.splits, run.km_elev);
  const extras = extrasOf(run);
  const mapH = chart ? CHART_MAP_H : MAP_H;
  const hasRoute = Array.isArray(run.route) && run.route.length > 0;
  // Os selos ocupam o topo do quadro: o percurso desce para não ficar embaixo deles.
  const inset = Math.min(badges.length, 3) * 70 + (badges.length ? 16 : 0);
  if (style === 'mapa' && hasRoute) {
    if (plain) {
      drawTrace(ctx, run, PAD_X, MAP_Y, CONTENT_W, mapH, trace, inset);
      if (traceLevels(run, trace).length) drawTraceLegend(ctx, trace, PAD_X + 24, MAP_Y + mapH - 24 - 78);
    } else await drawMap(ctx, run, { mapH, trace, light: bg === 'claro', inset });
  } else {
    panel(PAD_X, MAP_Y, CONTENT_W, mapH, 36);
    drawBigDistance(ctx, run, mapH);
  }
  drawBadges(ctx, badges, PAD_X + 24, MAP_Y + 24, CONTENT_W - 48);

  let boxY = MAP_Y + mapH + 40;
  if (chart) {
    drawSplitsChart(ctx, chart, extras, PAD_X, MAP_Y + mapH + 28, CONTENT_W, CHART_H, plain);
    boxY = MAP_Y + mapH + 28 + CHART_H + 28;
  }

  const stats = [
    [formatKm(run.distance_m), t('km')],
    [formatPace(paceSeconds(run.duration_s, run.distance_m)), t('ritmo /km')],
    [formatClock(run.duration_s), t('tempo')],
  ];
  if (run.kcal) stats.push([String(run.kcal), t('kcal')]);
  if (plain) drawPlainStats(ctx, stats, boxY);
  else {
    const gap = run.kcal ? 14 : 22;
    const boxW = (CONTENT_W - gap * (stats.length - 1)) / stats.length;
    stats.forEach(([value, label], i) => drawStatBox(ctx, PAD_X + i * (boxW + gap), boxY, boxW, 220, value, label, undefined, { maxSize: run.kcal ? 66 : 80, padX: run.kcal ? 18 : 30, labelSize: run.kcal ? 22 : 25 }));
  }
  if (!chart) drawExtrasLine(ctx, extras, boxY + 220 + 60);

  await drawFooter(ctx, CARD_HEIGHT - 214, t('Corra com o EAFIT Run'), refCode ? cardUrl(refCode) : '');
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

// `prepared`: o card já desenhado antes do toque (o share nativo exige o
// gesto ainda ativo, e baixar os blocos do mapa demora).
export async function shareRunCard(run, prepared, opts) {
  trackFeature('share_run');
  const refCode = myRefCode();
  const blob = (await prepared) || await renderRunCard(run, refCode, opts);
  const text = t('{v1} km de corrida no EAFIT Run 🏃 Corra com a gente: {v2}', { v1: formatKm(run.distance_m), v2: cardUrl(refCode) });
  return shareImageBlob(blob, 'minha-corrida.png', t('Minha corrida'), text);
}

export const RUN_PHOTO_STATS = ['percurso', 'distancia', 'ritmo', 'tempo', 'calorias'];

// Traçado sozinho (sem mapa), para ir por cima da foto. Pontos do GPS são
// suavizados (Chaikin), a linha ganha degradê do início (verde) ao fim
// (laranja), com halo escuro e contorno branco para aparecer em foto clara
// ou escura, e marcadores de largada e chegada.
const TRACE_STOPS = [[34, 197, 94], [250, 204, 21], [252, 76, 2]];

function traceColor(f) {
  const k = Math.min(Math.max(f, 0), 1) * (TRACE_STOPS.length - 1);
  const i = Math.min(Math.floor(k), TRACE_STOPS.length - 2);
  const u = k - i;
  const [r, g, b] = TRACE_STOPS[i].map((v, c) => Math.round(v + (TRACE_STOPS[i + 1][c] - v) * u));
  return `rgb(${r},${g},${b})`;
}

// Média móvel (tira o tremido do GPS, mantendo as pontas) e depois Chaikin,
// que corta os cantos e deixa as curvas suaves.
export function smoothPoints(pts, rounds = 2, window = 2) {
  let out = pts;
  if (window > 0 && pts.length > 2 * window + 1) {
    out = pts.map((p, i) => {
      if (i === 0 || i === pts.length - 1) return p;
      const k = Math.min(window, i, pts.length - 1 - i);
      let x = 0, y = 0;
      for (let j = i - k; j <= i + k; j++) { x += pts[j][0]; y += pts[j][1]; }
      return [x / (2 * k + 1), y / (2 * k + 1)];
    });
  }
  for (let r = 0; r < rounds && out.length > 2; r++) {
    const next = [out[0]];
    for (let i = 0; i < out.length - 1; i++) {
      const [x0, y0] = out[i];
      const [x1, y1] = out[i + 1];
      next.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25], [x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75]);
    }
    next.push(out[out.length - 1]);
    out = next;
  }
  return out;
}

function drawTrace(ctx, run, x0, y0, w, h, trace = 'laranja', inset = 0) {
  const view = mapView(run.route, w, h, 40 + inset / 2, { pan: [0, -inset / 2] });
  if (!view) return;
  // Pintado pelo ritmo ou pela subida: contorno branco e cada trecho na cor do nível.
  const pieces = traceLevels(run, trace);
  if (pieces.length) {
    ctx.save();
    ctx.translate(x0, y0);
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 18;
    strokeLevels(ctx, pieces, view.place, 'rgba(255,255,255,0.96)', [10, 7]);
    ctx.shadowBlur = 0;
    [[view.start, '#22c55e', 12], [view.end, '#fc4c02', 15]].forEach(([[px, py], color, r]) => {
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    });
    ctx.restore();
    return;
  }
  // Segmentos projetados, sem excesso de pontos (o suavizado dobra a contagem).
  const segs = run.route
    .filter(seg => Array.isArray(seg) && seg.length >= 2)
    .map(seg => {
      const step = Math.ceil(seg.length / 700);
      const pts = seg.filter((_, i) => i % step === 0 || i === seg.length - 1).map(p => view.place(p));
      return smoothPoints(pts);
    });
  if (!segs.length) return;
  const total = segs.reduce((n, sg) => n + sg.length, 0);

  ctx.save();
  ctx.translate(x0, y0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Sombra suave atrás de tudo: dá contraste em foto clara sem escurecer o resto.
  const cx = w / 2;
  const cy = h / 2;
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.5);
  halo.addColorStop(0, 'rgba(0,0,0,0.2)');
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(-40, -40, w + 80, h + 80);

  const path = (sg, from = 0, to = sg.length) => {
    ctx.beginPath();
    for (let i = from; i < to; i++) {
      if (i === from) ctx.moveTo(sg[i][0], sg[i][1]); else ctx.lineTo(sg[i][0], sg[i][1]);
    }
  };
  // Duas camadas inteiras (halo escuro e contorno branco), depois a cor por trechos.
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 18;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 17;
  segs.forEach(sg => { path(sg); ctx.stroke(); });
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.96)';
  ctx.lineWidth = 13;
  segs.forEach(sg => { path(sg); ctx.stroke(); });
  ctx.lineWidth = 8;
  let done = 0;
  segs.forEach(sg => {
    for (let i = 1; i < sg.length; i++) {
      ctx.strokeStyle = traceColor((done + i) / total);
      path(sg, i - 1, i + 1);
      ctx.stroke();
    }
    done += sg.length;
  });

  const marker = ([px, py], color, r) => {
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  };
  const first = segs[0][0];
  const lastSeg = segs[segs.length - 1];
  const last = lastSeg[lastSeg.length - 1];
  // Chegada: bola maior com miolo branco (alvo), mais fácil de achar que um ponto.
  // A largada (verde) só é desenhada quando fica longe da chegada; num percurso
  // fechado as duas coincidem e basta o alvo.
  marker(last, '#fc4c02', 15);
  ctx.beginPath();
  ctx.arc(last[0], last[1], 5.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 30) marker(first, '#22c55e', 12);
  ctx.restore();
}

// Card 9:16 com a foto da pessoa de fundo, o traçado da corrida e os números
// por cima (mesmo estilo do card de musculação com foto). `img` já carregada;
// `show` escolhe o que aparece: percurso, distancia, ritmo, tempo.
export async function renderRunPhotoCard(run, img, show = {}) {
  const on = k => show[k] !== false;
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#09090d';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  const r = coverRect(img.naturalWidth || img.width, img.naturalHeight || img.height, CARD_WIDTH, CARD_HEIGHT);
  ctx.drawImage(img, r.x, r.y, r.w, r.h);

  const topShade = ctx.createLinearGradient(0, 0, 0, 340);
  topShade.addColorStop(0, 'rgba(0,0,0,0.65)');
  topShade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = topShade;
  ctx.fillRect(0, 0, CARD_WIDTH, 340);
  await drawBrandBar(ctx, run);

  const stats = [
    on('distancia') && [formatKm(run.distance_m), t('km')],
    on('ritmo') && [formatPace(paceSeconds(run.duration_s, run.distance_m)), t('ritmo /km')],
    on('tempo') && [formatClock(run.duration_s), t('tempo')],
    run.kcal && on('calorias') && [String(run.kcal), t('kcal')],
  ].filter(Boolean);
  const hasTrace = on('percurso') && Array.isArray(run.route) && run.route.length > 0;

  const rowH = 155;
  const gridTop = CARD_HEIGHT - 170 - Math.max(3, stats.length) * rowH;
  const shadeTop = gridTop - 420;
  const bottom = ctx.createLinearGradient(0, shadeTop, 0, CARD_HEIGHT);
  bottom.addColorStop(0, 'rgba(0,0,0,0)');
  bottom.addColorStop(0.5, 'rgba(0,0,0,0.7)');
  bottom.addColorStop(1, 'rgba(0,0,0,0.9)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, shadeTop, CARD_WIDTH, CARD_HEIGHT - shadeTop);

  const traceW = 470;
  const colW = hasTrace ? CONTENT_W - traceW - 20 : CONTENT_W;
  ctx.textAlign = 'left';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = ORANGE_LIGHT;
  ctx.font = `800 30px ${FONT}`;
  setTracking(ctx, 4);
  ctx.fillText(t('MINHA CORRIDA'), PAD_X, gridTop - 130);
  setTracking(ctx, 0);
  ctx.fillStyle = '#ffffff';
  const title = runTitle(run);
  fitFont(ctx, title, CONTENT_W, 76, 900, 44);
  ctx.fillText(title, PAD_X, gridTop - 44);

  stats.forEach(([value, label], i) => {
    const y = gridTop + i * rowH;
    ctx.fillStyle = '#ffffff';
    fitFont(ctx, value, colW - 10, 98, 900, 40);
    ctx.fillText(value, PAD_X, y + 88);
    ctx.font = `700 27px ${FONT}`;
    ctx.fillStyle = MUTED;
    setTracking(ctx, 2.5);
    ctx.fillText(String(label).toUpperCase(), PAD_X, y + 128);
    setTracking(ctx, 0);
  });
  if (hasTrace) drawTrace(ctx, run, CARD_WIDTH - PAD_X - traceW, gridTop - 20, traceW, traceW);
  ctx.shadowBlur = 0;

  const brandY = CARD_HEIGHT - 110;
  const hasLogo = await drawLogo(ctx, PAD_X, brandY, 64);
  const bx = PAD_X + (hasLogo ? 82 : 0);
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 38px ${FONT}`;
  ctx.fillText('EAFIT', bx, brandY + 30);
  ctx.fillStyle = ORANGE_LIGHT;
  ctx.font = `600 24px ${FONT}`;
  ctx.fillText('eafit.com.br', bx, brandY + 58);

  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
}

// Compartilha o card com a foto (renderRunPhotoCard).
export async function shareRunPhoto(run, blob) {
  trackFeature('share_run_photo');
  const text = t('{v1} km de corrida no EAFIT Run 🏃 Corra com a gente: {v2}', { v1: formatKm(run.distance_m), v2: cardUrl(myRefCode()) });
  return shareImageBlob(blob, 'minha-corrida.jpg', t('Minha corrida'), text);
}

const BAND_ROWS = {
  frio: () => ['🥶', t('Frio'), `≤ ${tempText(15)}`],
  ameno: () => ['🌤️', t('Ameno'), `${tempText(16)}–${tempText(27)}`],
  calor: () => ['🥵', t('Calor'), `≥ ${tempText(28)}`],
};

// Card 9:16 do mês para os stories: km, corridas, tempo e ritmo médio, com
// "clima e ritmo" quando há corridas com clima o bastante. Sem mapa nem percurso.
// goalKm: meta de km do mês da pessoa (opcional): vira uma barra de progresso no cartão.
// Textos de cada período do cartão (week, month, year).
const PERIOD_TEXT = {
  week: {
    brand: () => t('Resumo da semana'),
    kicker: () => t('MINHA SEMANA DE CORRIDA'),
    unit: () => t('KM NA SEMANA'),
    goal: () => t('META DA SEMANA'),
    vs: pct => (pct > 0 ? t('▲ {v1}% a mais de km que na semana passada', { v1: pct })
      : pct < 0 ? t('▼ {v1}% a menos de km que na semana passada', { v1: -pct })
        : t('= Mesmos km da semana passada')),
  },
  month: {
    brand: () => t('Resumo do mês'),
    kicker: () => t('MEU MÊS DE CORRIDA'),
    unit: () => t('KM NO MÊS'),
    goal: () => t('META DO MÊS'),
    vs: pct => (pct > 0 ? t('▲ {v1}% a mais de km que no mesmo período do mês passado', { v1: pct })
      : pct < 0 ? t('▼ {v1}% a menos de km que no mesmo período do mês passado', { v1: -pct })
        : t('= Mesmos km do mês passado')),
  },
  year: {
    brand: () => t('Resumo do ano'),
    kicker: () => t('MEU ANO DE CORRIDA'),
    unit: () => t('KM NO ANO'),
    goal: () => t('META DO ANO'),
    vs: pct => (pct > 0 ? t('▲ {v1}% a mais de km que no mesmo período do ano passado', { v1: pct })
      : pct < 0 ? t('▼ {v1}% a menos de km que no mesmo período do ano passado', { v1: -pct })
        : t('= Mesmos km do ano passado')),
  },
};

// Título do cartão: o mês por extenso, os dias da semana ou o ano.
function periodTitle(sum, period, today) {
  const day = d => new Date(`${d}T12:00:00`).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
  const [from] = periodRange(today, period);
  if (period === 'week') return `${day(from)} – ${day(addDays(from, 6))}`;
  if (period === 'year') return from.slice(0, 4);
  const [y, m] = sum.month.split('-').map(Number);
  const name = new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// opts.period: 'month' (padrão), 'week' ou 'year'. goalKm é a meta do mesmo período.
export async function renderRunSummaryCard(runs, today, refCode = myRefCode(), goalKm = null, opts = {}) {
  const period = PERIOD_TEXT[opts.period] ? opts.period : 'month';
  const text = PERIOD_TEXT[period];
  const sum = periodSummary(runs, today, period);
  if (!sum) return null;
  const cmp = comparePeriod(runs, today, period);
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  drawBackground(ctx, CARD_WIDTH, CARD_HEIGHT);
  await drawBrandBar(ctx, { started_at: new Date().toISOString() }, text.brand());

  ctx.textAlign = 'left';
  ctx.fillStyle = ORANGE_LIGHT;
  ctx.font = `800 30px ${FONT}`;
  setTracking(ctx, 4);
  ctx.fillText(text.kicker(), PAD_X, 250);
  setTracking(ctx, 0);
  const heading = periodTitle(sum, period, today);
  ctx.fillStyle = '#ffffff';
  fitFont(ctx, heading, CONTENT_W, 76, 900, 44);
  ctx.fillText(heading, PAD_X, 345);

  // Distância do período em destaque; com período anterior, a comparação embaixo.
  const panelH = cmp ? 520 : 480;
  drawPanel(ctx, PAD_X, MAP_Y, CONTENT_W, panelH, 36);
  const km = formatKm(sum.meters, 1);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  fitFont(ctx, km, CONTENT_W - 60, 260, 900, 120);
  ctx.fillText(km, CARD_WIDTH / 2, MAP_Y + 270);
  ctx.font = `800 50px ${FONT}`;
  ctx.fillStyle = ORANGE_LIGHT;
  setTracking(ctx, 6);
  ctx.fillText(text.unit(), CARD_WIDTH / 2, MAP_Y + 370);
  setTracking(ctx, 0);
  if (cmp) {
    fitFont(ctx, text.vs(cmp.kmPct), CONTENT_W - 60, 30, 700, 20);
    ctx.fillStyle = cmp.kmPct >= 0 ? '#34d399' : MUTED;
    ctx.fillText(text.vs(cmp.kmPct), CARD_WIDTH / 2, MAP_Y + 430);
    if (cmp.paceDelta !== null && Math.abs(cmp.paceDelta) >= 3) {
      const faster = cmp.paceDelta < 0;
      const line = faster
        ? t('⚡ Ritmo {v1} s/km mais rápido', { v1: Math.abs(cmp.paceDelta) })
        : t('Ritmo {v1} s/km mais lento', { v1: cmp.paceDelta });
      fitFont(ctx, line, CONTENT_W - 60, 28, 700, 20);
      ctx.fillStyle = faster ? '#34d399' : MUTED;
      ctx.fillText(line, CARD_WIDTH / 2, MAP_Y + 476);
    }
  }

  const gap = 22;
  const boxW = (CONTENT_W - gap * 2) / 3;
  const boxY = MAP_Y + panelH + 40;
  [
    [String(sum.count), t('corridas')],
    [formatClock(sum.seconds), t('tempo')],
    [formatPace(sum.pace), t('ritmo /km')],
  ].forEach(([value, label], i) => drawStatBox(ctx, PAD_X + i * (boxW + gap), boxY, boxW, 220, value, label, undefined, { maxSize: 80, padX: 30, labelSize: 25 }));

  // Meta de km do mês: barra de progresso com o que já foi e a porcentagem.
  let nextTop = boxY + 220 + 40;
  const goal = goalProgress(runs, today, { [period]: goalKm })[0];
  if (goal) {
    drawPanel(ctx, PAD_X, nextTop, CONTENT_W, 150, 28);
    ctx.textAlign = 'left';
    ctx.fillStyle = ORANGE_LIGHT;
    ctx.font = `800 26px ${FONT}`;
    setTracking(ctx, 3);
    ctx.fillText(text.goal(), PAD_X + 36, nextTop + 52);
    setTracking(ctx, 0);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 34px ${FONT}`;
    ctx.fillText(`${formatKm(goal.doneM, 1)} / ${goalKm} km · ${goal.pct}%`, PAD_X + CONTENT_W - 36, nextTop + 52);
    const barX = PAD_X + 36;
    const barW = CONTENT_W - 72;
    roundedRectPath(ctx, barX, nextTop + 84, barW, 28, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fill();
    if (goal.pct > 0) {
      roundedRectPath(ctx, barX, nextTop + 84, Math.max(28, (barW * goal.pct) / 100), 28, 14);
      ctx.fillStyle = ORANGE_LIGHT;
      ctx.fill();
    }
    nextTop += 150 + 30;
  }

  // Clima e ritmo só das corridas do mês.
  // No cartão, mesmo uma corrida com clima já aparece (na aba Você são precisas 3).
  const wx = weatherBands(periodRuns(runs, today, period), 1);
  if (wx) {
    const top = nextTop;
    drawPanel(ctx, PAD_X, top, CONTENT_W, 90 + wx.bands.length * 64, 28);
    ctx.textAlign = 'left';
    ctx.fillStyle = ORANGE_LIGHT;
    ctx.font = `800 26px ${FONT}`;
    setTracking(ctx, 3);
    ctx.fillText(t('CLIMA E RITMO'), PAD_X + 36, top + 52);
    setTracking(ctx, 0);
    // Quantas corridas têm clima e a temperatura média delas, à direita do título.
    ctx.textAlign = 'right';
    ctx.font = `600 24px ${FONT}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(
      wx.total === 1
        ? t('1 corrida · {v1}', { v1: tempText(wx.avgTemp) })
        : t('{v1} corridas · média de {v2}', { v1: wx.total, v2: tempText(wx.avgTemp) }),
      PAD_X + CONTENT_W - 36, top + 52,
    );
    wx.bands.forEach((b, i) => {
      const [icon, name, range] = BAND_ROWS[b.key]();
      const y0 = top + 112 + i * 64;
      ctx.textAlign = 'left';
      ctx.fillStyle = wx.fastest === b.key ? ORANGE_LIGHT : '#ffffff';
      ctx.font = `700 32px ${FONT}`;
      ctx.fillText(`${icon} ${name}`, PAD_X + 36, y0);
      ctx.font = `600 24px ${FONT}`;
      ctx.fillStyle = MUTED;
      ctx.fillText(range, PAD_X + 290, y0);
      ctx.textAlign = 'right';
      ctx.font = `800 34px ${FONT}`;
      ctx.fillStyle = wx.fastest === b.key ? ORANGE_LIGHT : '#ffffff';
      ctx.fillText(b.pace === null ? '–' : `${formatPace(b.pace)}/km`, PAD_X + CONTENT_W - 36, y0);
    });
  }

  await drawFooter(ctx, CARD_HEIGHT - 214, t('Corra com o EAFIT Run'), refCode ? cardUrl(refCode) : '');
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

const SHARE_TEXT = {
  week: [(km, url) => t('{v1} km de corrida nesta semana no EAFIT Run 🏃 Corra com a gente: {v2}', { v1: km, v2: url }), 'minha-semana-de-corrida.png', () => t('Minha semana de corrida')],
  month: [(km, url) => t('{v1} km de corrida neste mês no EAFIT Run 🏃 Corra com a gente: {v2}', { v1: km, v2: url }), 'meu-mes-de-corrida.png', () => t('Meu mês de corrida')],
  year: [(km, url) => t('{v1} km de corrida neste ano no EAFIT Run 🏃 Corra com a gente: {v2}', { v1: km, v2: url }), 'meu-ano-de-corrida.png', () => t('Meu ano de corrida')],
};

export async function shareRunSummary(runs, today, prepared, goalKm = null, opts = {}) {
  trackFeature('share_run_summary');
  const period = SHARE_TEXT[opts.period] ? opts.period : 'month';
  const refCode = myRefCode();
  const blob = (await prepared) || await renderRunSummaryCard(runs, today, refCode, goalKm, opts);
  const sum = periodSummary(runs, today, period);
  const [message, file, title] = SHARE_TEXT[period];
  return shareImageBlob(blob, file, title(), message(formatKm(sum?.meters || 0, 1), cardUrl(refCode)));
}

// Card 9:16 de um desafio da comunidade concluído: total feito em destaque, a
// meta, a posição no ranking e o período. c vem de runsCommunity (fetchCommunityChallenges).
export async function renderChallengeCard(c, refCode = myRefCode()) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  drawBackground(ctx, CARD_WIDTH, CARD_HEIGHT);
  await drawBrandBar(ctx, { started_at: new Date().toISOString() }, t('Desafio concluído'));

  ctx.textAlign = 'left';
  ctx.fillStyle = ORANGE_LIGHT;
  ctx.font = `800 30px ${FONT}`;
  setTracking(ctx, 4);
  ctx.fillText(t('DESAFIO CONCLUÍDO'), PAD_X, 250);
  setTracking(ctx, 0);
  ctx.fillStyle = '#ffffff';
  fitFont(ctx, c.title, CONTENT_W, 76, 900, 36);
  ctx.fillText(c.title, PAD_X, 345);

  drawPanel(ctx, PAD_X, MAP_Y, CONTENT_W, 480, 36);
  const amount = formatCommunityAmount(c.metric, c.value);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  fitFont(ctx, amount, CONTENT_W - 60, 220, 900, 90);
  ctx.fillText(amount, CARD_WIDTH / 2, MAP_Y + 250);
  ctx.font = `800 44px ${FONT}`;
  ctx.fillStyle = ORANGE_LIGHT;
  setTracking(ctx, 4);
  ctx.fillText(`🏅 ${communityGoalText(c).toUpperCase()}`, CARD_WIDTH / 2, MAP_Y + 370);
  setTracking(ctx, 0);

  const day = d => new Date(`${d}T12:00:00`).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
  const gap = 22;
  const boxW = (CONTENT_W - gap * 2) / 3;
  const boxY = MAP_Y + 480 + 40;
  [
    [c.rank ? `${c.rank}º` : '–', t('posição')],
    [String(c.members), t('participantes')],
    [`${day(c.start)}–${day(c.end)}`, t('período')],
  ].forEach(([value, label], i) => drawStatBox(ctx, PAD_X + i * (boxW + gap), boxY, boxW, 220, value, label, undefined, { maxSize: 80, padX: 30, labelSize: 25 }));

  await drawFooter(ctx, CARD_HEIGHT - 214, t('Corra com o EAFIT Run'), refCode ? cardUrl(refCode) : '');
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

export async function shareChallengeCard(c, prepared) {
  trackFeature('share_run_challenge');
  const refCode = myRefCode();
  const blob = (await prepared) || await renderChallengeCard(c, refCode);
  const text = t('Fechei o desafio "{v1}" no EAFIT Run 🏅 Corra com a gente: {v2}', { v1: c.title, v2: cardUrl(refCode) });
  return shareImageBlob(blob, 'desafio-concluido.png', t('Desafio concluído'), text);
}
