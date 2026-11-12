// Vídeo de um destaque do Instagram: uma sequência de cenas com entrada/saída suave e uma barra
// de progresso no topo. Há três tipos de cena: tela do app com título (`print`), só texto, e
// gravação do app em uso (`flow`: quadros de uma gravação, com a legenda mudando por etapa).
// Só usa a API de canvas 2D; a codificação em MP4 está em reelVideo.js (renderHighlight).
import { H, W, background, clamp, drawPhone, easeOut, text } from './reelRender';
import { FLOWS, flowSeconds } from './highlightFlows';

export const SCENE_SECONDS = 4.5;
const FADE = 0.4;

// Duração de uma cena: a da gravação, a própria (`seconds`) ou a padrão.
export const sceneSeconds = scene => (scene.flow ? flowSeconds(scene.flow) : scene.seconds || SCENE_SECONDS);

// Aceita a lista de cenas ou só a quantidade (todas com a duração padrão).
export const highlightSeconds = scenes => Math.ceil(
  Array.isArray(scenes) ? scenes.reduce((sum, sc) => sum + sceneSeconds(sc), 0) : scenes * SCENE_SECONDS,
);

// Quadro da gravação que está na tela em `lt` segundos.
function flowCell(flow, lt) {
  let acc = 0;
  for (const [cell, hold] of FLOWS[flow].steps) {
    acc += hold;
    if (lt < acc) return cell;
  }
  return FLOWS[flow].steps.at(-1)[0];
}

function drawFlowScene(ctx, scene, img, lt, alpha) {
  const flow = FLOWS[scene.flow];
  const chapters = scene.chapters || [];
  let chapter = chapters[0] || { at: 0, headline: '', subline: '' };
  for (const c of chapters) if (c.at <= lt) chapter = c;
  const chapterAlpha = alpha * clamp((lt - chapter.at) / 0.35);
  const slide = easeOut(lt / 0.9);

  const y = text(ctx, chapter.headline, { x: 72, y: 190, size: 72, alpha: chapterAlpha });
  text(ctx, chapter.subline || '', { x: 72, y: y + 8, size: 40, weight: 500, color: '#a1a1aa', alpha: chapterAlpha });

  const top = 520;
  const maxH = H - top - 230;
  const base = Math.min((W - 144 - 36) / flow.fw, (maxH - 36) / flow.fh);
  const iw = flow.fw * base;
  const ih = flow.fh * base;
  const cell = flowCell(scene.flow, lt);
  const src = [(cell % flow.cols) * flow.fw, Math.floor(cell / flow.cols) * flow.fh, flow.fw, flow.fh];
  ctx.save();
  ctx.globalAlpha = alpha;
  drawPhone(ctx, img, (W - iw) / 2, top + 18 + (1 - slide) * 600, iw, ih, { src });
  ctx.restore();
}

// scenes: [{ headline, subline, print } | { flow, chapters } | { headline, subline, seconds }];
// imgs[i] = imagem da cena (print ou atlas da gravação; null para só texto); t = segundos desde o início.
export function drawHighlightFrame(ctx, scenes, imgs, t) {
  const n = scenes.length;
  const durs = scenes.map(sceneSeconds);
  let i = 0;
  let start = 0;
  while (i < n - 1 && t >= start + durs[i]) {
    start += durs[i];
    i += 1;
  }
  const dur = durs[i];
  const lt = t - start;
  const alpha = Math.min(clamp(lt / FADE), i === n - 1 ? 1 : clamp((dur - lt) / FADE));
  const scene = scenes[i];
  const img = imgs[i];

  background(ctx);

  // Barra de progresso (um trecho por cena, do tamanho da cena), como a dos stories.
  const gap = 12;
  const total = durs.reduce((a, b) => a + b, 0);
  const room = W - 144 - gap * (n - 1);
  let x = 72;
  for (let k = 0; k < n; k += 1) {
    const seg = (room * durs[k]) / total;
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.fillRect(x, 70, seg, 8);
    const fill = k < i ? 1 : k === i ? clamp(lt / durs[k]) : 0;
    if (fill > 0) {
      ctx.fillStyle = '#f97316';
      ctx.fillRect(x, 70, seg * fill, 8);
    }
    x += seg + gap;
  }

  if (scene.flow && img) {
    drawFlowScene(ctx, scene, img, lt, alpha);
  } else if (img) {
    // Título no alto (abaixo da área que o Instagram cobre) e o print entrando de baixo.
    const y = text(ctx, scene.headline, { x: 72, y: 190, size: 72, alpha });
    text(ctx, scene.subline || '', { x: 72, y: y + 8, size: 40, weight: 500, color: '#a1a1aa', alpha });
    const top = 520;
    const maxH = H - top - 230;
    const slide = easeOut(lt / 0.9);
    const zoom = 1 + 0.05 * clamp((lt - 0.8) / 3.5);
    const base = Math.min((W - 144 - 36) / img.width, (maxH - 36) / img.height);
    const iw = img.width * base * zoom;
    const ih = img.height * base * zoom;
    ctx.save();
    ctx.globalAlpha = alpha;
    drawPhone(ctx, img, (W - iw) / 2, top + 18 + (1 - slide) * 600, iw, ih);
    ctx.restore();
  } else {
    // Cena só de texto, no meio.
    const dy = (1 - easeOut(lt / 0.7)) * 50;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#f97316';
    ctx.fillRect(72, 640 + dy, 120, 10);
    ctx.restore();
    const y = text(ctx, scene.headline, { x: 72, y: 700 + dy, size: 96, alpha });
    text(ctx, scene.subline || '', { x: 72, y: y + 24, size: 48, weight: 500, color: '#a1a1aa', alpha });
  }

  text(ctx, 'eafit.com.br', { x: W / 2, y: H - 190, size: 44, weight: 700, color: '#f97316', align: 'center', alpha });
}
