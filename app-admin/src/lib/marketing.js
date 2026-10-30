import { db } from './supabase';
// Vídeos de execução que o app já usa, com o crédito exigido pela licença.
import { EXERCISE_VIDEOS, videoCredit } from '../../../app-react/src/data/exerciseVideos.js';

// Marketing: redes da EAFIT conectadas (Facebook, Instagram, Threads), fila de
// publicação, biblioteca de mídia e comentários. Tabelas e RPCs em
// supabase/migrations/20261222010000_marketing.sql; quem fala com as redes são
// as Edge Functions marketing-oauth e marketing (tokens nunca chegam aqui).

export const SITE = 'https://eafit.com.br';
export const BUCKET = 'marketing-media';
export const MAX_BYTES = 100 * 1024 * 1024; // igual ao file_size_limit do bucket

export const PLATFORMS = {
  facebook: { label: 'Facebook', limit: 63000 },
  instagram: { label: 'Instagram', limit: 2200 },
  threads: { label: 'Threads', limit: 500 },
};

export const STATUS_LABEL = {
  pending: 'Na fila', processing: 'Processando na rede', published: 'Publicado', failed: 'Falhou', canceled: 'Cancelado',
};

// Respostas prontas da caixa de comentários ({nome} vira o nome de quem comentou).
export const QUICK_REPLIES = [
  'Valeu, {nome}! 💪 O app é gratuito: eafit.com.br/app',
  'Oi, {nome}! Dá para baixar direto pelo navegador, no celular ou no computador: eafit.com.br/app',
  'Obrigado pelo carinho, {nome}! Bons treinos 🔥',
  '{nome}, chama a gente no direct que te ajudamos com isso 😉',
];

// ---------- biblioteca ----------

// Prints do app publicados na landing (landing/img/app). Proporção de celular:
// para o feed viram uma arte (createArt) com fundo e título.
export const APP_PRINTS = [
  { slug: 'treino', label: 'Treino do dia' },
  { slug: 'ao-vivo', label: 'Treino ao vivo' },
  { slug: 'evolucao', label: 'Evolução' },
  { slug: 'historico', label: 'Histórico' },
  { slug: 'nutricao', label: 'Nutrição' },
  { slug: 'nutricao-diario', label: 'Diário de nutrição' },
  { slug: 'agua', label: 'Água' },
];

export function printUrl(slug, lang = 'pt') {
  return `${SITE}/img/app/${slug}${lang === 'en' ? '-en' : ''}.webp`;
}

// Um item por arquivo (vários exercícios dividem o mesmo vídeo).
export function exerciseVideoList() {
  const bySlug = new Map();
  for (const [name, slug] of Object.entries(EXERCISE_VIDEOS)) {
    if (!bySlug.has(slug)) bySlug.set(slug, name);
  }
  return [...bySlug].map(([slug, name]) => {
    const credit = videoCredit(slug);
    return { slug, label: name, url: `${SITE}/app/videos/${slug}.mp4`, credit, shareAlike: /BY-SA/.test(credit) };
  }).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

export function publicUrl(path) {
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function fetchMedia() {
  const { data, error } = await db.from('marketing_media')
    .select('id, kind, storage_path, title, credit, width, height, size_bytes, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(m => ({ ...m, url: publicUrl(m.storage_path) }));
}

export function validateUpload(file) {
  if (!file) return 'Escolha um arquivo.';
  if (!['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime'].includes(file.type)) {
    return 'Formato não aceito: use JPG, PNG, MP4 ou MOV (é o que as redes aceitam).';
  }
  if (file.size > MAX_BYTES) return 'Arquivo maior que 100 MB.';
  return '';
}

function slugify(name) {
  return String(name || 'arquivo').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'arquivo';
}

export async function uploadMedia({ file, title, credit = null, width = null, height = null, adminId }) {
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'video/mp4': 'mp4', 'video/quicktime': 'mov' }[file.type];
  const path = `${Date.now()}-${slugify(title || file.name)}.${ext}`;
  const { error: upErr } = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;
  const { error } = await db.from('marketing_media').insert({
    kind: file.type.startsWith('video/') ? 'video' : 'image', storage_path: path, title: String(title || '').trim().slice(0, 120),
    credit, width, height, size_bytes: file.size, created_by: adminId,
  });
  if (error) {
    await db.storage.from(BUCKET).remove([path]); // não deixa arquivo órfão
    throw error;
  }
}

export async function removeMedia(item) {
  const { error } = await db.storage.from(BUCKET).remove([item.storage_path]);
  if (error) throw error;
  const { error: rowErr } = await db.from('marketing_media').delete().eq('id', item.id);
  if (rowErr) throw rowErr;
}

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

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
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
  const maxH = h - top - footer;
  const scale = Math.min((w - pad * 2) / img.width, maxH / img.height);
  const iw = img.width * scale;
  const ih = img.height * scale;
  const ix = (w - iw) / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.6)';
  ctx.shadowBlur = 50;
  roundRect(ctx, ix, top, iw, ih, 36);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, ix, top, iw, ih, 36);
  ctx.clip();
  ctx.drawImage(img, ix, top, iw, ih);
  ctx.restore();

  ctx.fillStyle = '#f97316';
  ctx.font = '700 40px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('eafit.com.br', w / 2, h - footer + 30);

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) throw new Error('Não deu para gerar a arte.');
  return { blob, width: w, height: h };
}

// ---------- contas ----------

export async function fetchAccounts() {
  const { data, error } = await db.from('marketing_accounts')
    .select('id, platform, external_id, name, username, picture_url, parent_id, status, status_detail, token_expires_at, connected_at, last_synced_at')
    .order('platform');
  if (error) throw error;
  return data || [];
}

export function accountLabel(a) {
  if (!a) return 'Conta removida';
  return a.username ? `@${a.username}` : a.name;
}

// Erro de função com status != 2xx: o supabase-js só diz "non-2xx"; o motivo
// está no corpo da resposta.
async function invoke(fn, body) {
  const { data, error } = await db.functions.invoke(fn, { body });
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// Leva para o login da Meta/Threads; a volta cai em #/marketing-contas.
export async function startConnect(provider) {
  const { url } = await invoke('marketing-oauth', { provider });
  window.location.assign(url);
}

export async function disconnectAccount(id) {
  const { error } = await db.rpc('marketing_disconnect', { p_account: id });
  if (error) throw error;
}

// ---------- posts ----------

// Legenda final: texto + créditos de mídia de terceiros (exigidos pela licença).
export function finalCaption(caption, media = []) {
  const credits = [...new Set(media.map(m => m.credit).filter(Boolean))];
  const text = String(caption || '').trim();
  return credits.length ? `${text}${text ? '\n\n' : ''}${credits.join('\n')}` : text;
}

export function countHashtags(text) {
  return (String(text || '').match(/#[\p{L}\p{N}_]+/gu) || []).length;
}

// Mesmas regras da função (checkPost), para avisar antes de criar o post.
export function validatePost({ caption, media, accounts, scheduledAt = null, now = new Date() }) {
  const errors = [];
  const text = finalCaption(caption, media);
  const platforms = new Set(accounts.map(a => a.platform));
  const videos = media.filter(m => m.type === 'video').length;
  if (!accounts.length) errors.push('Escolha ao menos uma conta.');
  if (!text && !media.length) errors.push('Escreva a legenda ou escolha uma mídia.');
  if (videos > 1 || (videos === 1 && media.length > 1)) errors.push('Vídeo vai sozinho no post (sem outras mídias).');
  if (media.length > 10) errors.push('No máximo 10 imagens por post.');
  if (platforms.has('instagram') && !media.length) errors.push('Instagram exige ao menos uma imagem ou vídeo.');
  for (const p of platforms) {
    const { label, limit } = PLATFORMS[p];
    if (text.length > limit) errors.push(`${label}: a legenda (com créditos) passa de ${limit} caracteres.`);
  }
  if (platforms.has('instagram') && countHashtags(text) > 30) errors.push('Instagram: no máximo 30 hashtags.');
  if (scheduledAt && new Date(scheduledAt) <= now) errors.push('O horário agendado já passou.');
  return errors;
}

export async function createPost({ caption, media, accountIds, scheduledAt = null }) {
  const { data, error } = await db.rpc('marketing_create_post', {
    p_caption: finalCaption(caption, media),
    p_media: media.map(({ type, url, credit }) => ({ type, url, ...(credit ? { credit } : {}) })),
    p_accounts: accountIds,
    p_scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
  });
  if (error) throw error;
  return data;
}

export function runPost(postId) {
  return invoke('marketing', { action: 'run', postId });
}

export async function fetchPosts(limit = 30) {
  const { data, error } = await db.from('marketing_posts')
    .select('id, caption, media, scheduled_at, created_at, marketing_post_targets(id, account_id, status, permalink, error, published_at)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(p => ({ ...p, targets: p.marketing_post_targets || [] }));
}

export async function cancelPost(postId) {
  const { error } = await db.rpc('marketing_cancel_post', { p_post: postId });
  if (error) throw error;
}

export async function retryTarget(targetId) {
  const { error } = await db.rpc('marketing_retry_target', { p_target: targetId });
  if (error) throw error;
}

// ---------- comentários ----------

export async function fetchComments({ filter = 'open', platform = '' } = {}) {
  let q = db.from('marketing_comments')
    .select('id, account_id, external_id, post_permalink, post_caption, author, text, commented_at, hidden, answered, reply_text, replied_at, marketing_accounts!inner(platform, name, username)')
    .order('commented_at', { ascending: false, nullsFirst: false })
    .limit(200);
  if (filter === 'open') q = q.eq('answered', false).eq('hidden', false);
  if (filter === 'hidden') q = q.eq('hidden', true);
  if (platform) q = q.eq('marketing_accounts.platform', platform);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(c => ({ ...c, account: c.marketing_accounts }));
}

// "@bia" → "bia"; "Ana Souza" → "Ana".
export function firstName(author) {
  const s = String(author || '').replace(/^@/, '').trim();
  return s.split(/\s+/)[0] || '';
}

export function fillReply(template, author) {
  const name = firstName(author);
  return template.replace(/,?\s*\{nome\}/g, m => (name ? m.replace('{nome}', name) : '')).replace(/^\s*[!,]\s*/, '').trim();
}

export function syncComments() {
  return invoke('marketing', { action: 'sync' });
}

export function replyComment(commentId, text) {
  return invoke('marketing', { action: 'reply', commentId, text });
}

export function hideComment(commentId, hidden) {
  return invoke('marketing', { action: 'hide', commentId, hidden });
}
