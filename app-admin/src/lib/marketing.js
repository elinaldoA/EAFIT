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
  tiktok: { label: 'TikTok', limit: 2200 },
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
export function validatePost({
  caption, media, accounts, scheduledAt = null, now = new Date(), format = 'feed', tiktok = null, tiktokCreator = null, videoDuration = null,
}) {
  if (format === 'story') return validateStory({ media, accounts, scheduledAt, now });
  const errors = [];
  const text = finalCaption(caption, media);
  const platforms = new Set(accounts.map(a => a.platform));
  const videos = media.filter(m => m.type === 'video').length;
  if (!accounts.length) errors.push('Escolha ao menos uma conta.');
  if (!text && !media.length) errors.push('Escreva a legenda ou escolha uma mídia.');
  if (videos > 1 || (videos === 1 && media.length > 1)) errors.push('Vídeo vai sozinho no post (sem outras mídias).');
  if (media.length > 10) errors.push('No máximo 10 imagens por post.');
  if (platforms.has('instagram') && !media.length) errors.push('Instagram exige ao menos uma imagem ou vídeo.');
  if (platforms.has('tiktok') && !(media.length === 1 && videos === 1)) errors.push('TikTok: o post precisa ser um único vídeo.');
  if (platforms.has('tiktok')) errors.push(...validateTikTok(tiktok, tiktokCreator, videoDuration));
  for (const p of platforms) {
    const { label, limit } = PLATFORMS[p];
    if (text.length > limit) errors.push(`${label}: a legenda (com créditos) passa de ${limit} caracteres.`);
  }
  if (platforms.has('instagram') && countHashtags(text) > 30) errors.push('Instagram: no máximo 30 hashtags.');
  if (scheduledAt && new Date(scheduledAt) <= now) errors.push('O horário agendado já passou.');
  return errors;
}

// Story não tem legenda: mídia que exige crédito (licença) não pode ir.
function validateStory({ media, accounts, scheduledAt, now }) {
  const errors = [];
  if (!accounts.length) errors.push('Escolha ao menos uma conta.');
  if (accounts.some(a => a.platform === 'threads')) errors.push('Threads não tem stories: desmarque o Threads.');
  if (accounts.some(a => a.platform === 'tiktok')) errors.push('TikTok não tem stories pelo painel: desmarque o TikTok.');
  if (media.length !== 1) errors.push('Story leva exatamente uma imagem ou um vídeo.');
  if (media.some(m => m.credit)) errors.push('Mídia com crédito obrigatório não pode ir para story (não há legenda para o crédito).');
  if (scheduledAt && new Date(scheduledAt) <= now) errors.push('O horário agendado já passou.');
  return errors;
}

// ---------- TikTok (regras de compartilhamento exigidas na auditoria) ----------

export const TIKTOK_PRIVACY_LABEL = {
  PUBLIC_TO_EVERYONE: 'Todos',
  MUTUAL_FOLLOW_FRIENDS: 'Amigos',
  FOLLOWER_OF_CREATOR: 'Seguidores',
  SELF_ONLY: 'Somente eu',
};

// Nada vem marcado: quem publica escolhe (regra do TikTok).
export const EMPTY_TIKTOK = {
  privacy_level: '', allow_comment: false, allow_duet: false, allow_stitch: false,
  commercial: false, brand_organic: false, brand_content: false,
};

export function validateTikTok(tiktok, creator, videoDuration) {
  const errors = [];
  const s = tiktok || EMPTY_TIKTOK;
  if (!s.privacy_level) errors.push('TikTok: escolha quem pode ver o vídeo.');
  if (s.commercial && !s.brand_organic && !s.brand_content) errors.push('TikTok: diga se o conteúdo comercial é da sua marca ou de marca parceira.');
  if (s.commercial && s.brand_content && s.privacy_level === 'SELF_ONLY') errors.push('TikTok: conteúdo de marca não pode ficar como "Somente eu".');
  if (creator?.maxDurationSec && videoDuration && videoDuration > creator.maxDurationSec) {
    errors.push(`TikTok: a conta aceita vídeos de até ${creator.maxDurationSec} segundos.`);
  }
  return errors;
}

// O que vai para o banco: divulgação comercial só conta com a chave ligada.
export function tiktokPayload(s) {
  return {
    privacy_level: s.privacy_level,
    allow_comment: !!s.allow_comment, allow_duet: !!s.allow_duet, allow_stitch: !!s.allow_stitch,
    brand_organic: !!(s.commercial && s.brand_organic), brand_content: !!(s.commercial && s.brand_content),
  };
}

export function tiktokLabel(s) {
  if (!s?.commercial) return '';
  if (s.brand_content) return 'Seu vídeo será rotulado como "Parceria paga".';
  if (s.brand_organic) return 'Seu vídeo será rotulado como "Conteúdo promocional".';
  return '';
}

export function fetchTikTokCreator(accountId) {
  return invoke('marketing', { action: 'tiktokCreator', accountId });
}

export async function createPost({ caption, media, accountIds, scheduledAt = null, format = 'feed', tiktok = null }) {
  const story = format === 'story';
  const { data, error } = await db.rpc('marketing_create_post', {
    p_caption: story ? '' : finalCaption(caption, media),
    p_media: media.map(({ type, url, credit }) => ({ type, url, ...(credit ? { credit } : {}) })),
    p_accounts: accountIds,
    p_scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    p_format: format,
    ...(tiktok ? { p_tiktok: tiktokPayload(tiktok) } : {}),
  });
  if (error) throw error;
  return data;
}

export function runPost(postId) {
  return invoke('marketing', { action: 'run', postId });
}

export async function fetchPosts(limit = 30) {
  const { data, error } = await db.from('marketing_posts')
    .select('id, caption, media, format, scheduled_at, created_at, marketing_post_targets(id, account_id, status, permalink, error, published_at)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map(p => ({ ...p, targets: p.marketing_post_targets || [] }));
}

export async function cancelPost(postId) {
  const { error } = await db.rpc('marketing_cancel_post', { p_post: postId });
  if (error) throw error;
}

// Apaga nas redes onde saiu e descarta o que está na fila; o post só some do
// painel quando todas as exclusões dão certo (Edge Function marketing).
export function deletePost(postId) {
  return invoke('marketing', { action: 'delete', postId });
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

// ---------- publicação automática ----------
// Fila de conteúdo pronto que o cron publica sozinho (migration
// 20261230010000_marketing_autopost.sql): feed 12h e stories 19h (Brasília).

export async function fetchAutopost() {
  const [settings, queue] = await Promise.all([
    db.from('marketing_autopost_settings').select('enabled').eq('id', true).maybeSingle(),
    db.from('marketing_autopost_queue').select('id, position, key, format, caption, media, posted_at, skipped_at').order('position'),
  ]);
  if (settings.error) throw settings.error;
  if (queue.error) throw queue.error;
  const items = queue.data || [];
  return {
    enabled: settings.data?.enabled !== false,
    items,
    pending: items.filter(i => !i.posted_at && !i.skipped_at),
    skipped: items.filter(i => i.skipped_at),
    posted: items.filter(i => i.posted_at).length,
  };
}

export async function setAutopostEnabled(enabled) {
  const { error } = await db.rpc('marketing_autopost_set_enabled', { p_enabled: enabled });
  if (error) throw error;
}

// Horários do cron (UTC) de cada formato: 12h (feed), 17h (reel) e 19h (story) de Brasília (UTC-3, sem horário de verão).
export const AUTOPOST_HOUR_UTC = { feed: 15, reel: 20, story: 22 };
const BRT_OFFSET_MS = 3 * 3600 * 1000;

// Dia de Brasília (AAAA-MM-DD) de um instante.
export function brtDay(date) {
  return new Date(new Date(date).getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10);
}

// Agenda da fila: cada item pendente no seu horário. O cron publica um item de
// cada formato por dia, então o k-ésimo pendente do formato sai k dias depois
// do próximo horário do cron.
export function autopostSchedule(pending, now = new Date()) {
  const out = [];
  for (const format of ['feed', 'reel', 'story']) {
    const first = new Date(now);
    first.setUTCHours(AUTOPOST_HOUR_UTC[format], 0, 0, 0);
    if (first <= now) first.setUTCDate(first.getUTCDate() + 1);
    pending.filter(i => i.format === format).forEach((item, k) => {
      const at = new Date(first);
      at.setUTCDate(at.getUTCDate() + k);
      out.push({ item, format, at, today: brtDay(at) === brtDay(now) });
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

// Próxima saída de cada formato.
export function nextAutopostSlots(pending, now = new Date()) {
  const seen = new Set();
  return autopostSchedule(pending, now).filter(s => (seen.has(s.format) ? false : seen.add(s.format)));
}

// Separa as hashtags do fim da legenda do texto.
export function splitCaption(caption) {
  const text = String(caption || '');
  const tags = text.match(/#[\p{L}\p{N}_]+/gu) || [];
  const body = text.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { body, tags };
}

// ---------- resultados ----------
// Desempenho dos posts (marketing_post_metrics, preenchida pela função marketing)
// e cadastros que vieram das redes (admin_marketing_conversion). Migration
// 20270102010000_marketing_results.sql.

export const KIND_LABEL = { reel: 'Reel', carousel: 'Carrossel', image: 'Foto', video: 'Vídeo', text: 'Texto' };

export const MEDIUM_LABEL = {
  bio: 'Link da bio', story: 'Story', post: 'Legenda ou comentário', ads: 'Anúncio', parceiro: 'Parceiro', '': 'Sem tipo no link',
};

export async function fetchMetrics() {
  const { data, error } = await db.from('marketing_post_metrics')
    .select('account_id, external_id, permalink, caption, kind, thumb_url, posted_at, likes, comments, shares, saves, reach, views, insights_ok, fetched_at')
    .order('posted_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

export function refreshMetrics() {
  return invoke('marketing', { action: 'metrics' });
}

export async function fetchConversion(days = 30) {
  const { data, error } = await db.rpc('admin_marketing_conversion', { days_back: days });
  if (error) throw error;
  return (data || []).map(r => ({
    source: r.mc_source, medium: r.mc_medium, visits: Number(r.mc_visits), signups: Number(r.mc_signups),
    confirmed: Number(r.mc_confirmed), activated: Number(r.mc_activated),
  }));
}

// Pontuação para ranquear posts: alcance quando a rede deu; senão visualizações;
// senão a soma das interações. Assim posts sem insights ainda entram na lista.
export function postScore(m) {
  const interactions = (m.likes || 0) + (m.comments || 0) + (m.shares || 0) + (m.saves || 0);
  return m.reach ?? m.views ?? interactions;
}

// Média de alcance (ou interações, sem insights) por formato: mostra o que rende mais.
export function averageByKind(rows) {
  const groups = new Map();
  for (const m of rows) {
    const g = groups.get(m.kind) || { kind: m.kind, posts: 0, score: 0, interactions: 0 };
    g.posts += 1;
    g.score += postScore(m);
    g.interactions += (m.likes || 0) + (m.comments || 0) + (m.shares || 0) + (m.saves || 0);
    groups.set(m.kind, g);
  }
  return [...groups.values()]
    .map(g => ({ ...g, average: Math.round(g.score / g.posts), averageInteractions: Math.round(g.interactions / g.posts) }))
    .sort((a, b) => b.average - a.average);
}

// Cadastros por visita, em %, com uma casa (null sem visitas).
export function conversionRate(visits, signups) {
  return visits > 0 ? Math.round((signups / visits) * 1000) / 10 : null;
}
