import { cardKit } from '../../lib/shareCard';
import { myRefCode } from '../../lib/myRef';
import { trackFeature } from '../../lib/tracking';
import { t } from '../../lib/i18n';
import { mapView, TILE_SIZE } from './route';
import { tileSrc } from './mapStyle';
import { runTitle, paceSeconds, formatPace, formatClock, formatKm } from './runs';

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

async function drawMap(ctx, run) {
  const x0 = PAD_X;
  const w = CONTENT_W;
  drawPanel(ctx, x0, MAP_Y, w, MAP_H, 36);
  const view = mapView(run.route, w / MAP_SCALE, MAP_H / MAP_SCALE, 40);
  if (!view) return false;

  ctx.save();
  roundedRectPath(ctx, x0, MAP_Y, w, MAP_H, 36);
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
  if (loaded) {
    ctx.fillStyle = 'rgba(9,9,13,0.45)';
    ctx.fillRect(0, 0, w / MAP_SCALE, MAP_H / MAP_SCALE);
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
  // Traçado numa cor só: brilho, contorno branco e a linha laranja por cima.
  const segs = run.route.filter(seg => Array.isArray(seg) && seg.length >= 2);
  ctx.save();
  ctx.shadowColor = 'rgba(252,76,2,0.85)';
  ctx.shadowBlur = 14;
  segs.forEach(seg => line(seg, 'rgba(252,76,2,0.55)', 9));
  ctx.restore();
  segs.forEach(seg => line(seg, 'rgba(255,255,255,0.95)', 8));
  segs.forEach(seg => line(seg, '#fc4c02', 5));

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

  // Atribuição exigida pelo OpenStreetMap.
  if (loaded) {
    ctx.textAlign = 'right';
    ctx.font = `600 20px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('© OpenStreetMap', x0 + w - 24, MAP_Y + MAP_H - 22);
  }
  return true;
}

// Sem percurso (corrida sem GPS ou curta demais): a distância no lugar do mapa.
function drawBigDistance(ctx, run) {
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 220px ${FONT}`;
  ctx.fillText(formatKm(run.distance_m), CARD_WIDTH / 2, MAP_Y + MAP_H / 2 + 40);
  ctx.font = `800 44px ${FONT}`;
  ctx.fillStyle = ORANGE_LIGHT;
  setTracking(ctx, 6);
  ctx.fillText('KM', CARD_WIDTH / 2, MAP_Y + MAP_H / 2 + 130);
  setTracking(ctx, 0);
}

export async function renderRunCard(run, refCode = myRefCode()) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  drawBackground(ctx, CARD_WIDTH, CARD_HEIGHT);

  // Topo: marca + data.
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
  ctx.fillText(t('Corrida'), tx, y + 74);
  const when = run.started_at ? new Date(run.started_at) : new Date(`${run.run_date}T12:00:00`);
  ctx.textAlign = 'right';
  ctx.font = `700 26px ${FONT}`;
  setTracking(ctx, 2);
  ctx.fillText(formatCardDate(when).toUpperCase(), CARD_WIDTH - PAD_X, y + 52);
  setTracking(ctx, 0);

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

  if (Array.isArray(run.route) && run.route.length) await drawMap(ctx, run);
  else {
    drawPanel(ctx, PAD_X, MAP_Y, CONTENT_W, MAP_H, 36);
    drawBigDistance(ctx, run);
  }

  const gap = 22;
  const boxW = (CONTENT_W - gap * 2) / 3;
  const boxY = MAP_Y + MAP_H + 40;
  const stats = [
    [formatKm(run.distance_m), t('km')],
    [formatPace(paceSeconds(run.duration_s, run.distance_m)), t('ritmo /km')],
    [formatClock(run.duration_s), t('tempo')],
  ];
  stats.forEach(([value, label], i) => drawStatBox(ctx, PAD_X + i * (boxW + gap), boxY, boxW, 200, value, label));

  await drawFooter(ctx, CARD_HEIGHT - 214, t('Corra com o EAFIT Run'), refCode ? cardUrl(refCode) : '');
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

// `prepared`: o card já desenhado antes do toque (o share nativo exige o
// gesto ainda ativo, e baixar os blocos do mapa demora).
export async function shareRunCard(run, prepared) {
  trackFeature('share_run');
  const refCode = myRefCode();
  const blob = (await prepared) || await renderRunCard(run, refCode);
  const text = t('{v1} km de corrida no EAFIT Run 🏃 Corra com a gente: {v2}', { v1: formatKm(run.distance_m), v2: cardUrl(refCode) });
  return shareImageBlob(blob, 'minha-corrida.png', t('Minha corrida'), text);
}
