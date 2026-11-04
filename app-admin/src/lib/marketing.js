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

// Texto sugerido para o Reel de cada print (gancho, título e subtítulo); o admin edita.
export const REEL_DEFAULTS = {
  treino: { hook: 'Ainda monta treino em planilha?', title: 'Treino pronto em segundos', sub: 'Monte, envie e acompanhe.' },
  'ao-vivo': { hook: 'Chega de anotar série no papel', title: 'Registre cada série na hora', sub: 'Treino ao vivo, sem papel.' },
  evolucao: { hook: 'Seu aluno enxerga a própria evolução?', title: 'Quem vê a evolução não desiste', sub: 'Cada carga vira progresso.' },
  historico: { hook: 'Qual foi a carga do aluno semana passada?', title: 'Todo o histórico num só lugar', sub: 'Treinos, cargas e datas sempre à mão.' },
  nutricao: { hook: 'Treino e dieta em apps diferentes?', title: 'Tudo no mesmo app', sub: 'Treino, calorias e macros juntos.' },
  'nutricao-diario': { hook: 'Anotar o que comeu é chato?', title: 'Diário de nutrição rápido', sub: 'Registre as refeições em segundos.' },
  agua: { hook: 'Seu aluno bebe água o suficiente?', title: 'Meta de água em dia', sub: 'Um hábito simples que muda o treino.' },
};

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

// Muda a legenda de um post já publicado. Só o Facebook deixa; Instagram e Threads
// voltam com `ok: false` e o motivo, e o caminho para eles é excluir e republicar.
export function editPost(postId, caption) {
  return invoke('marketing', { action: 'edit', postId, caption });
}

// Post feito direto no app da rede (lista de Resultados): excluir e, no Facebook, editar.
export function deleteExternalPost(accountId, externalId) {
  return invoke('marketing', { action: 'deleteExternal', accountId, externalId });
}

export function editExternalPost(accountId, externalId, caption) {
  return invoke('marketing', { action: 'editExternal', accountId, externalId, caption });
}

// Quem mudou e quem não mudou, em português, a partir do retorno de editPost.
export function editSummary(post, results, accountsById) {
  const name = t => {
    const a = accountsById.get(t.account_id);
    return a ? PLATFORMS[a.platform].label : 'Conta removida';
  };
  const byTarget = new Map(post.targets.map(t => [t.id, t]));
  const done = results.filter(r => r.ok).map(r => name(byTarget.get(r.target) || {}));
  const failed = results.filter(r => !r.ok).map(r => `${name(byTarget.get(r.target) || {})}: ${r.error}`);
  if (!failed.length) return `Legenda atualizada em ${done.join(', ')}.`;
  return `${done.length ? `Mudou em ${done.join(', ')}. ` : ''}Não mudou: ${failed.join(' · ')}`;
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
  const columns = 'id, position, key, format, caption, media, posted_at, skipped_at';
  const [settings, withSlot] = await Promise.all([
    db.from('marketing_autopost_settings').select('enabled').eq('id', true).maybeSingle(),
    db.from('marketing_autopost_queue').select(`${columns}, slot`).order('position'),
  ]);
  // Sem a migration dos horários de refeição a coluna `slot` não existe: lê sem ela.
  const queue = withSlot.error
    ? await db.from('marketing_autopost_queue').select(columns).order('position')
    : withSlot;
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

// Faixas da publicação automática: cada uma publica um item por dia no seu horário
// (cron em UTC; Brasília é UTC-3, sem horário de verão). Story pode ter um horário
// de refeição (`slot`): café, almoço, jantar e ceia, com conteúdo de nutrição.
export const SLOT_LABEL = { cafe: 'Café da manhã', almoco: 'Almoço', jantar: 'Jantar', ceia: 'Ceia' };
export const AUTOPOST_LANES = [
  { key: 'story:cafe', format: 'story', slot: 'cafe', utc: [10, 0], time: '7h', label: 'Story · Café da manhã' },
  { key: 'story:almoco', format: 'story', slot: 'almoco', utc: [14, 30], time: '11h30', label: 'Story · Almoço' },
  { key: 'feed', format: 'feed', slot: null, utc: [15, 0], time: '12h', label: 'Feed' },
  { key: 'reel', format: 'reel', slot: null, utc: [20, 0], time: '17h', label: 'Reel' },
  { key: 'story:jantar', format: 'story', slot: 'jantar', utc: [21, 0], time: '18h', label: 'Story · Jantar' },
  { key: 'story', format: 'story', slot: null, utc: [22, 0], time: '19h', label: 'Story' },
  { key: 'story:ceia', format: 'story', slot: 'ceia', utc: [0, 30], time: '21h30', label: 'Story · Ceia' },
];
const BRT_OFFSET_MS = 3 * 3600 * 1000;

// Faixa de um item da fila: o formato, mais o horário de refeição quando é story de nutrição.
export function laneKey(item) {
  return item.format === 'story' && item.slot ? `story:${item.slot}` : item.format;
}

export function laneLabel(item) {
  return AUTOPOST_LANES.find(l => l.key === laneKey(item))?.label || item.format;
}

// Dia de Brasília (AAAA-MM-DD) de um instante.
export function brtDay(date) {
  return new Date(new Date(date).getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10);
}

// Agenda da fila: cada item pendente no seu horário. O cron publica um item de
// cada faixa por dia, então o k-ésimo pendente da faixa sai k dias depois do
// próximo horário do cron.
export function autopostSchedule(pending, now = new Date()) {
  const out = [];
  for (const lane of AUTOPOST_LANES) {
    const first = new Date(now);
    first.setUTCHours(lane.utc[0], lane.utc[1], 0, 0);
    if (first <= now) first.setUTCDate(first.getUTCDate() + 1);
    pending.filter(i => laneKey(i) === lane.key).forEach((item, k) => {
      const at = new Date(first);
      at.setUTCDate(at.getUTCDate() + k);
      out.push({ item, format: lane.format, lane: lane.key, at, today: brtDay(at) === brtDay(now) });
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

// Próxima saída de cada faixa.
export function nextAutopostSlots(pending, now = new Date()) {
  const seen = new Set();
  return autopostSchedule(pending, now).filter(s => (seen.has(s.lane) ? false : seen.add(s.lane)));
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

// ---------- editor da fila automática ----------
// RPCs de 20270103010000_marketing_autopost_editor.sql: só mexem no que ainda não saiu.

export const QUEUE_ERRORS = {
  not_found: 'Esse item já saiu ou não existe mais.',
  story_has_no_caption: 'Story não tem legenda.',
  caption_too_long: 'A legenda passa de 5.000 caracteres.',
  caption_required: 'Escreva a legenda.',
  invalid_media: 'Escolha de 1 a 10 imagens ou 1 vídeo.',
  video_alone: 'Vídeo vai sozinho no post.',
  reel_needs_video: 'Reel precisa de 1 vídeo.',
  story_needs_one_media: 'Story leva exatamente 1 imagem ou 1 vídeo.',
};

async function queueRpc(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(QUEUE_ERRORS[error.message] || error.message);
  return data;
}

export const updateQueueCaption = (id, caption) => queueRpc('marketing_autopost_update', { p_id: id, p_caption: caption });
export const moveQueueItem = (id, direction) => queueRpc('marketing_autopost_move', { p_id: id, p_direction: direction });
export const removeQueueItem = id => queueRpc('marketing_autopost_remove', { p_id: id });
export const restoreQueueItem = id => queueRpc('marketing_autopost_restore', { p_id: id });
export const addQueueItem = ({ format, slot = null, caption, media }) => queueRpc('marketing_autopost_add', {
  p_format: format, p_caption: format === 'story' ? '' : caption,
  p_media: media.map(({ type, url }) => ({ type, url })),
  // Só envia quando há horário de refeição: a função antiga (sem a migration) não tem esse parâmetro.
  ...(format === 'story' && slot ? { p_slot: slot } : {}),
});

// Primeiro/último do formato entre os pendentes: desliga o botão de subir/descer.
export function queuePosition(pending, item) {
  const same = pending.filter(i => laneKey(i) === laneKey(item));
  const idx = same.findIndex(i => i.id === item.id);
  return { first: idx === 0, last: idx === same.length - 1, number: idx + 1, total: same.length };
}
