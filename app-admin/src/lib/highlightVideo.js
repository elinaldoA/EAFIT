// Vídeo de um destaque do Instagram: uma sequência de cenas (tela do app com título, ou só
// texto) de 4,5 s cada, com entrada/saída suave e uma barra de progresso no topo. Só usa a
// API de canvas 2D; a codificação em MP4 está em reelVideo.js (renderHighlight).
import { H, W, background, clamp, drawPhone, easeOut, text } from './reelRender';

export const SCENE_SECONDS = 4.5;
const FADE = 0.4;

export const highlightSeconds = count => Math.round(count * SCENE_SECONDS);

// scenes: [{ headline, subline, print }]; imgs[i] = imagem do print (ou null para só texto);
// t = segundos desde o início.
export function drawHighlightFrame(ctx, scenes, imgs, t) {
  const n = scenes.length;
  const i = Math.min(n - 1, Math.floor(t / SCENE_SECONDS));
  const lt = t - i * SCENE_SECONDS;
  const alpha = Math.min(clamp(lt / FADE), i === n - 1 ? 1 : clamp((SCENE_SECONDS - lt) / FADE));
  const scene = scenes[i];
  const img = imgs[i];

  background(ctx);

  // Barra de progresso (um trecho por cena), como a dos stories.
  const gap = 12;
  const seg = (W - 144 - gap * (n - 1)) / n;
  for (let k = 0; k < n; k += 1) {
    const x = 72 + k * (seg + gap);
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.fillRect(x, 70, seg, 8);
    const fill = k < i ? 1 : k === i ? clamp(lt / SCENE_SECONDS) : 0;
    if (fill > 0) {
      ctx.fillStyle = '#f97316';
      ctx.fillRect(x, 70, seg * fill, 8);
    }
  }

  if (img) {
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
