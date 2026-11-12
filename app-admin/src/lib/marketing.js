import { drawPhone } from './reelRender';
import { db } from './supabase';
// Vídeos de execução que o app já usa, com o crédito exigido pela licença.
import { EXERCISE_VIDEOS, videoCredit } from '../../../app-react/src/data/exerciseVideos.js';

// Marketing: redes da EAFIT conectadas (Facebook, Instagram, TikTok), fila de
// publicação, biblioteca de mídia e comentários. Tabelas e RPCs em
// supabase/migrations/20261222010000_marketing.sql; quem fala com as redes são
// as Edge Functions marketing-oauth e marketing (tokens nunca chegam aqui).

export const SITE = 'https://eafit.com.br';
export const BUCKET = 'marketing-media';
export const MAX_BYTES = 100 * 1024 * 1024; // igual ao file_size_limit do bucket

export const PLATFORMS = {
  facebook: { label: 'Facebook', limit: 63000 },
  instagram: { label: 'Instagram', limit: 2200 },
  tiktok: { label: 'TikTok', limit: 2200 },
};

export const STATUS_LABEL = {
  pending: 'Na fila', processing: 'Processando na rede', published: 'Publicado', failed: 'Falhou', canceled: 'Cancelado',
};

// Respostas prontas da caixa de comentários ({nome} vira o nome de quem comentou).
export const QUICK_REPLIES = [
  'Valeu, {nome}! 💪 Comece agora: eafit.com.br/app',
  'Oi, {nome}! Dá para baixar direto pelo navegador, no celular ou no computador. Comece agora: eafit.com.br/app',
  'Obrigado pelo carinho, {nome}! Bons treinos 🔥 Comece agora: eafit.com.br/app',
  '{nome}, chama a gente no direct que te ajudamos com isso 😉 Comece agora: eafit.com.br/app',
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
  // Linha primeiro: se o arquivo falhar depois, sobra um arquivo solto, e não um item quebrado na biblioteca.
  const { error: rowErr } = await db.from('marketing_media').delete().eq('id', item.id);
  if (rowErr) throw rowErr;
  const { error } = await db.storage.from(BUCKET).remove([item.storage_path]);
  if (error) throw error;
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
  const bezel = Math.round(w * 0.017);
  const maxH = h - top - footer - bezel * 2;
  const scale = Math.min((w - pad * 2 - bezel * 2) / img.width, maxH / img.height);
  const iw = img.width * scale;
  const ih = img.height * scale;
  const ix = (w - iw) / 2;
  drawPhone(ctx, img, ix, top + bezel, iw, ih, { bezel });

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
    .select('id, platform, external_id, name, username, picture_url, parent_id, status, status_detail, token_expires_at, connected_at, last_synced_at, metrics_note')
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

// Leva para o login da Meta ou do TikTok; a volta cai em #/marketing-contas.
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
  const text = String(caption || '').trim();
  // Crédito que já está na legenda (post republicado a partir do texto final) não se repete.
  const credits = [...new Set(media.map(m => m.credit).filter(Boolean))].filter(c => !text.includes(c));
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

// Muda a legenda de um post já publicado. Só o Facebook deixa; o Instagram
// volta com `ok: false` e o motivo, e o caminho para eles é excluir e republicar.
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
// 20261230010000_marketing_autopost.sql; horários ajustados em
// 20270106010000_marketing_horarios_pico.sql): horários por faixa em AUTOPOST_LANES (Brasília).

// Quantos já publicados vêm para a tela: a lista cresce todo dia e só os mais
// recentes aparecem (o total sai de uma contagem à parte). Para o intervalo
// mínimo entre temas bastam os últimos dias.
export const POSTED_SHOWN = 60;

export async function fetchAutopost() {
  const columns = 'id, position, key, format, caption, media, posted_at, skipped_at, post_id';
  // Sem as migrations dos horários de refeição (`slot`) ou da temporada
  // (`season`, 20270111010000) a coluna não existe: tenta com ela e cai para menos.
  const attempts = [`${columns}, slot, season`, `${columns}, slot`, columns];
  const base = cols => db.from('marketing_autopost_queue').select(cols);
  let open = null;
  let recent = null;
  for (const cols of attempts) {
    [open, recent] = await Promise.all([
      base(cols).is('posted_at', null).order('position'),
      base(cols).not('posted_at', 'is', null).order('posted_at', { ascending: false }).limit(POSTED_SHOWN),
    ]);
    if (!open.error && !recent.error) break;
  }
  const [settings, count, seasonRow] = await Promise.all([
    db.from('marketing_autopost_settings').select('enabled').eq('id', true).maybeSingle(),
    db.from('marketing_autopost_queue').select('id', { count: 'exact', head: true }).not('posted_at', 'is', null),
    db.from('app_settings').select('value').eq('key', 'season').maybeSingle(),
  ]);
  if (settings.error) throw settings.error;
  if (open.error) throw open.error;
  if (recent.error) throw recent.error;
  const pendingAndSkipped = open.data || [];
  const posted = recent.data || [];
  const items = [...pendingAndSkipped, ...posted];
  return {
    enabled: settings.data?.enabled !== false,
    items,
    pending: pendingAndSkipped.filter(i => !i.skipped_at),
    skipped: pendingAndSkipped.filter(i => i.skipped_at),
    posted: count.error ? posted.length : (count.count ?? posted.length),
    // Temporadas do app (app_settings "season"): decidem quando sai cada item de temporada.
    season: seasonRow?.error ? null : (seasonRow?.data?.value || null),
  };
}

export async function setAutopostEnabled(enabled) {
  const { error } = await db.rpc('marketing_autopost_set_enabled', { p_enabled: enabled });
  if (error) throw error;
}

// Faixas da publicação automática: cada uma publica um item por dia no seu horário
// (cron em UTC; Brasília é UTC-3, sem horário de verão). Story pode ter um horário
// de refeição (`slot`): só café e hidratação têm conteúdo de nutrição. Os stories das
// 12h30 e das 19h30 são gerais, para o fluxo não ficar repetindo comida e água
// (migration 20270122010000_marketing_stories_diversos.sql).
// `utc`/`time` valem de segunda a sexta; `weekendUtc`/`weekendTime`, quando há, no
// sábado e no domingo (migration 20270113010000_marketing_horarios_rendimento.sql).
// Formatos espaçados para não competirem entre si: feed no pico do almoço, Reel no
// pico da noite, stories distribuídos pelo dia.
export const SLOT_LABEL = { bomdia: 'Bom dia', cafe: 'Café da manhã', conta: 'Criar conta', agua: 'Hidratação', treino: 'Hora do treino' };
// Faixas de nutrição (o resto das faixas com `slot` é de engajamento: bom dia, treino e criar conta).
export const NUTRI_SLOTS = ['cafe', 'agua'];
export const AUTOPOST_LANES = [
  // Volume reduzido (migration 20270201010000): pouco retorno com 9 stories + feed + Reel por dia.
  // `days` = dias da semana (0 = dom) em que a faixa sai; sem `days`, todo dia.
  { key: 'story:bomdia', format: 'story', slot: 'bomdia', utc: [10, 30], time: '7h30', weekendUtc: [11, 0], weekendTime: '8h', label: 'Story · Bom dia' },
  { key: 'story:conta', format: 'story', slot: 'conta', utc: [13, 0], time: '10h', label: 'Story · Criar conta' },
  { key: 'feed', format: 'feed', slot: null, utc: [14, 30], time: '11h30', days: [1, 3, 5], label: 'Feed' },
  { key: 'story:treino', format: 'story', slot: 'treino', utc: [19, 30], time: '16h30', label: 'Story · Hora do treino' },
  // Faixa geral: o cron publica um story às 12h30, da mesma fila.
  { key: 'story', format: 'story', slot: null, utc: [15, 30], time: '12h30', label: 'Story' },
  { key: 'reel', format: 'reel', slot: null, utc: [23, 45], time: '20h45', weekendUtc: [21, 30], weekendTime: '18h30', days: [2, 4, 6], label: 'Reel' },
  // Faixas desligadas (sem cron): itens que sobraram nelas ficam parados na fila.
  { key: 'story:cafe', format: 'story', slot: 'cafe', off: true, utc: [9, 30], time: '6h30', label: 'Story · Café da manhã (desligado)' },
  { key: 'story:agua', format: 'story', slot: 'agua', off: true, utc: [18, 0], time: '15h', label: 'Story · Hidratação (desligado)' },
];

const DAY_NAMES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// Quando a faixa sai, para mostrar no painel: "todo dia às 15h" ou
// "seg a sex às 6h30, sáb e dom às 9h".
export function laneWhen(lane) {
  if (lane.off) return 'desligado';
  if (lane.days) {
    const names = lane.days.map(d => DAY_NAMES[d]);
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : names[0];
    return lane.weekendTime ? `${list} (sáb às ${lane.weekendTime}, demais às ${lane.time})` : `${list} às ${lane.time}`;
  }
  return lane.weekendTime ? `seg a sex às ${lane.time}, sáb e dom às ${lane.weekendTime}` : `todo dia às ${lane.time}`;
}

// Horário (UTC) da faixa num dia de Brasília (AAAA-MM-DD).
export function laneAt(lane, day) {
  const [y, m, d] = day.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const [h, min] = (dow === 0 || dow === 6) && lane.weekendUtc ? lane.weekendUtc : lane.utc;
  return new Date(Date.UTC(y, m - 1, d, h, min));
}
// Todas as saídas da faixa no dia: o horário principal e os extras (`extra`).
export function laneRuns(lane, day) {
  const [y, m, d] = day.split('-').map(Number);
  if (lane.off || (lane.days && !lane.days.includes(new Date(Date.UTC(y, m - 1, d)).getUTCDay()))) return [];
  return [laneAt(lane, day), ...(lane.extra || []).map(([h, min]) => new Date(Date.UTC(y, m - 1, d, h, min)))];
}
const BRT_OFFSET_MS = 3 * 3600 * 1000;

// Faixa de um item da fila: o formato, mais o horário de refeição quando é story de nutrição.
export function laneKey(item) {
  return item.format === 'story' && item.slot ? `story:${item.slot}` : item.format;
}

export function laneLabel(item) {
  const label = AUTOPOST_LANES.find(l => l.key === laneKey(item))?.label || item.format;
  return item.season ? `${label} · ${seasonTag(item.season)}` : label;
}

// Temporadas do app (app-react/src/lib/season.js). Um item da fila com `season`
// só sai enquanto esse tema estiver no ar no app e, nesse período, passa na
// frente dos itens comuns (migration 20270111010000, marketing_autopost_run).
export const SEASON_LABEL = {
  carnaval: 'Carnaval', pascoa: 'Páscoa', namorados: 'Namorados', festa_junina: 'Festa Junina', outubro_rosa: 'Outubro Rosa',
  halloween: 'Dia das Bruxas', novembro_azul: 'Novembro Azul', natal: 'Natal', ano_novo: 'Ano Novo',
};
const SEASON_EMOJI = {
  carnaval: '🎭', pascoa: '🐰', namorados: '💕', festa_junina: '🌽', outubro_rosa: '💗', halloween: '🎃', novembro_azul: '💙', natal: '🎄', ano_novo: '🎆',
};

export function seasonTag(theme) {
  return `${SEASON_EMOJI[theme] || ''} ${SEASON_LABEL[theme] || theme}`.trim();
}

const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

// Tema no ar num dia (AAAA-MM-DD) pela configuração de temporada do app
// ({ enabled, periods: [{ theme, startsOn, endsOn }] } ou o formato antigo de um
// tema só), igual a marketing_active_season no banco.
export function seasonOnDay(season, day) {
  if (!season || season.enabled !== true) return null;
  const list = Array.isArray(season.periods) ? season.periods : [season];
  return list.find(p => p?.theme && isDay(p.startsOn) && isDay(p.endsOn) && day >= p.startsOn && day <= p.endsOn)?.theme || null;
}

// Dia de Brasília (AAAA-MM-DD) de um instante.
export function brtDay(date) {
  return new Date(new Date(date).getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10);
}

// Até quantos dias à frente a agenda procura a temporada de um item.
const SEASON_HORIZON_DAYS = 400;

// Tema de um item da fila: "treino-feed" → "treino" (igual a marketing_autopost_theme).
export function autopostTheme(key) {
  return String(key || '').replace(/-(feed|reel|story)$/, '');
}

// Tema que saiu em qualquer formato há menos disso fica para depois.
export const THEME_GAP_DAYS = 3;
const THEME_GAP_MS = THEME_GAP_DAYS * 24 * 3600 * 1000;

// Agenda da fila: cada item pendente no seu horário. O cron publica um item de
// cada faixa por dia, na ordem da fila, com as regras de marketing_autopost_run:
// item cujo tema saiu (em qualquer formato) nos últimos THEME_GAP_DAYS dias vai
// para o fim da vez; item de temporada (`season`) só sai nos dias em que o tema
// está no ar no app (`season` = app_settings "season") e, nesses dias, passa na
// frente; fora deles espera. `posted` são os itens já publicados (key, posted_at).
// Item cuja temporada não cai nos próximos SEASON_HORIZON_DAYS dias fica fora.
export function autopostSchedule(pending, now = new Date(), season = null, posted = []) {
  const out = [];
  const last = new Map();
  const mark = (key, ms) => { if (key && !(last.get(autopostTheme(key)) >= ms)) last.set(autopostTheme(key), ms); };
  for (const p of posted) if (p.posted_at) mark(p.key, new Date(p.posted_at).getTime());
  const queues = new Map(AUTOPOST_LANES.map(l => [l.key, pending.filter(i => laneKey(i) === l.key)]));
  const today = brtDay(now);
  const [ty, tm, td] = today.split('-').map(Number);
  for (let d = 0; d <= SEASON_HORIZON_DAYS; d += 1) {
    const left = [...queues.values()].flat();
    if (left.length === 0 || (season?.enabled !== true && !left.some(i => !i.season))) break;
    const day = new Date(Date.UTC(ty, tm - 1, td + d)).toISOString().slice(0, 10);
    const runs = AUTOPOST_LANES.flatMap(lane => laneRuns(lane, day).map(at => ({ lane, at })))
      .filter(r => r.at > now && queues.get(r.lane.key).length > 0)
      .sort((a, b) => a.at - b.at);
    for (const { lane, at } of runs) {
      const queue = queues.get(lane.key);
      const theme = seasonOnDay(season, day);
      const recent = i => {
        const t = i.key ? last.get(autopostTheme(i.key)) : undefined;
        return t !== undefined && at.getTime() - t < THEME_GAP_MS;
      };
      // Mesma ordem do banco: tema fora dos últimos dias, depois temporada, depois posição.
      const rank = i => (recent(i) ? 2 : 0) + (i.season ? 0 : 1);
      let best = null;
      for (const i of queue) {
        if (i.season && i.season !== theme) continue;
        if (!best || rank(i) < rank(best)) best = i;
      }
      if (!best) continue;
      queue.splice(queue.indexOf(best), 1);
      mark(best.key, at.getTime());
      out.push({ item: best, format: lane.format, lane: lane.key, at, today: brtDay(at) === brtDay(now) });
    }
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

export const KIND_LABEL = { reel: 'Reel', carousel: 'Carrossel', image: 'Foto', video: 'Vídeo', text: 'Texto', story: 'Story' };

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
    mature: Number(r.mc_mature || 0), retained: Number(r.mc_retained || 0),
  }));
}

// Cadastros e retenção por post com link marcado com utm_content (Facebook).
export async function fetchContentConversion(days = 30) {
  const { data, error } = await db.rpc('admin_marketing_content', { days_back: days });
  if (error) throw error;
  return (data || []).map(r => ({
    source: r.mx_source, content: r.mx_content, caption: r.mx_caption || '', visits: Number(r.mx_visits), signups: Number(r.mx_signups),
    activated: Number(r.mx_activated), mature: Number(r.mx_mature), retained: Number(r.mx_retained),
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

// Posts promovidos: anúncios das contas de anúncios conectadas (só leitura, ads_read).
export function fetchAds(days = 30) {
  return invoke('marketing', { action: 'ads', days });
}

export const AD_STATUS_LABEL = {
  ACTIVE: 'No ar', PAUSED: 'Pausado', CAMPAIGN_PAUSED: 'Campanha pausada', ADSET_PAUSED: 'Conjunto pausado',
  PENDING_REVIEW: 'Em análise', IN_PROCESS: 'Em análise', DISAPPROVED: 'Reprovado', WITH_ISSUES: 'Com problema',
  ARCHIVED: 'Arquivado', DELETED: 'Excluído',
};

// Gasto, alcance, cliques e custos de uma lista de anúncios (custos nulos quando não há base).
export function adTotals(ads) {
  const t = (ads || []).reduce((a, r) => ({
    spend: a.spend + r.spend, reach: a.reach + r.reach, impressions: a.impressions + r.impressions,
    clicks: a.clicks + r.clicks, results: a.results + r.results,
  }), { spend: 0, reach: 0, impressions: 0, clicks: 0, results: 0 });
  return { ...t, cpc: t.clicks ? t.spend / t.clicks : null, cpm: t.impressions ? (t.spend / t.impressions) * 1000 : null, cpr: t.results ? t.spend / t.results : null };
}

// O anúncio de um Reel devolve /p/CODIGO e o post tem /reel/CODIGO: o que vale é o código (e o id no Facebook).
const normLink = u => String(u || '').split('?')[0].replace(/\/+$/, '').split('/').pop().toLowerCase();
const isStory = m => m.kind === 'story';
// Story não tem curtida: o que pesa é conversa (respostas) e compartilhamento.
const weighted = m => (isStory(m)
  ? 3 * (m.comments || 0) + 3 * (m.shares || 0)
  : (m.likes || 0) + 2 * (m.comments || 0) + 3 * (m.saves || 0) + 3 * (m.shares || 0));

// Posts orgânicos recentes com mais chance de render bem se forem promovidos: os que mais
// engajaram em relação à média da própria conta (curtidas, comentários x2, salvos e
// compartilhamentos x3; com alcance, a taxa sobre o alcance), sem os que já têm anúncio.
// Stories entram à parte (comparados só com outros stories) e, se ainda estão no ar
// (menos de 24 h), vêm com `live` e o horário em que saem: só dá para impulsionar até lá.
// `confidence` fica 'baixa' quando a base é pequena (sem alcance ou poucas interações).
// `kind` ('' = todos) filtra o formato.
export function promoCandidates(metrics, ads, { now = Date.now(), days = 30, limit = 5, kind = '' } = {}) {
  const promotedIds = new Set((ads || []).map(a => a.post_id).filter(Boolean));
  const promotedLinks = new Set((ads || []).map(a => normLink(a.permalink)).filter(Boolean));
  const recent = (metrics || []).filter(m => {
    if (!m.posted_at) return false;
    const age = now - new Date(m.posted_at).getTime();
    return age >= (isStory(m) ? 0 : 86_400_000) && age <= days * 86_400_000;
  });
  const groupKey = m => `${m.account_id}|${isStory(m) ? 'story' : 'feed'}`;
  const groups = new Map();
  for (const m of recent) {
    const g = groups.get(groupKey(m)) || { sum: 0, n: 0 };
    g.sum += m.reach > 0 ? weighted(m) / m.reach : weighted(m);
    g.n += 1;
    groups.set(groupKey(m), g);
  }
  return recent
    .filter(m => (!kind || m.kind === kind) && !promotedIds.has(m.external_id) && !promotedLinks.has(normLink(m.permalink)))
    .map(m => {
      const w = weighted(m);
      const rate = m.reach > 0 ? w / m.reach : null;
      const g = groups.get(groupKey(m));
      const avg = g.sum / g.n;
      const own = rate ?? w;
      const liveUntil = isStory(m) && now - new Date(m.posted_at).getTime() < 86_400_000 ? new Date(new Date(m.posted_at).getTime() + 86_400_000).toISOString() : null;
      return {
        ...m, weighted: w, rate: rate === null ? null : Math.round(rate * 1000) / 10,
        vsAverage: avg > 0 ? Math.round((own / avg) * 10) / 10 : null, liveUntil,
        confidence: m.reach > 0 && w >= 10 ? 'ok' : 'baixa',
      };
    })
    .filter(m => m.weighted >= (isStory(m) ? 1 : 2))
    .sort((a, b) => (b.vsAverage ?? 0) - (a.vsAverage ?? 0) || b.weighted - a.weighted)
    .slice(0, limit);
}

// ---------- análises de marketing ----------

// Engajamento de cada post em relação à média da própria conta (stories à parte).
// Com alcance usa a taxa sobre o alcance; sem alcance, a soma ponderada.
function withRatios(list) {
  const key = m => `${m.account_id}|${isStory(m) ? 'story' : 'feed'}`;
  const groups = new Map();
  for (const m of list) {
    const g = groups.get(key(m)) || { sum: 0, n: 0 };
    g.sum += m.reach > 0 ? weighted(m) / m.reach : weighted(m);
    g.n += 1;
    groups.set(key(m), g);
  }
  return list.map(m => {
    const g = groups.get(key(m));
    const avg = g.sum / g.n;
    const w = weighted(m);
    const own = m.reach > 0 ? w / m.reach : w;
    return { ...m, weighted: w, vsAverage: avg > 0 ? own / avg : null };
  });
}

const round1 = n => Math.round(n * 10) / 10;

// Dia da semana (0 = domingo) e hora do post no horário de Brasília.
function spParts(iso) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', hour12: false }).formatToParts(new Date(iso));
  const get = t => parts.find(p => p.type === t)?.value;
  return { weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')), hour: Number(get('hour')) % 24 };
}

export const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const PERIODS_OF_DAY = [
  { key: 'madrugada', label: 'Madrugada (0h–6h)', from: 0, to: 6 },
  { key: 'manha', label: 'Manhã (6h–11h)', from: 6, to: 11 },
  { key: 'almoco', label: 'Almoço (11h–14h)', from: 11, to: 14 },
  { key: 'tarde', label: 'Tarde (14h–18h)', from: 14, to: 18 },
  { key: 'noite', label: 'Noite (18h–24h)', from: 18, to: 24 },
];

// Em que dia da semana e período do dia os posts do feed engajam mais (horário de Brasília).
// Só aponta como melhor o grupo com `minPosts` posts ou mais.
export function bestTimes(metrics, { now = Date.now(), days = 90, minPosts = 2 } = {}) {
  const feed = (metrics || []).filter(m => m.posted_at && !isStory(m) && now - new Date(m.posted_at).getTime() <= days * 86_400_000);
  const rated = withRatios(feed).filter(m => m.vsAverage !== null).map(m => ({ ...m, ...spParts(m.posted_at) }));
  const group = test => {
    const list = rated.filter(test);
    return { posts: list.length, ratio: list.length ? round1(list.reduce((t, m) => t + m.vsAverage, 0) / list.length) : null };
  };
  const byWeekday = WEEKDAYS.map((label, i) => ({ key: i, label, ...group(m => m.weekday === i) }));
  const byPeriod = PERIODS_OF_DAY.map(p => ({ key: p.key, label: p.label, ...group(m => m.hour >= p.from && m.hour < p.to) }));
  const top = rows => rows.filter(r => r.posts >= minPosts && r.ratio !== null).sort((a, b) => b.ratio - a.ratio)[0] || null;
  return { byWeekday, byPeriod, bestWeekday: top(byWeekday), bestPeriod: top(byPeriod), posts: rated.length };
}

// Hashtags das legendas e o engajamento médio (vs a média da conta) dos posts que as usaram.
export function hashtagStats(metrics, { now = Date.now(), days = 90, minPosts = 2 } = {}) {
  const feed = (metrics || []).filter(m => m.posted_at && !isStory(m) && m.caption && now - new Date(m.posted_at).getTime() <= days * 86_400_000);
  const tags = new Map();
  for (const m of withRatios(feed)) {
    if (m.vsAverage === null) continue;
    const found = new Set((m.caption.match(/#[\p{L}\p{N}_]+/gu) || []).map(t => t.toLowerCase()));
    for (const t of found) {
      const g = tags.get(t) || { tag: t, posts: 0, sum: 0 };
      g.posts += 1;
      g.sum += m.vsAverage;
      tags.set(t, g);
    }
  }
  const list = [...tags.values()].filter(g => g.posts >= minPosts)
    .map(g => ({ tag: g.tag, posts: g.posts, ratio: round1(g.sum / g.posts) }))
    .sort((a, b) => b.ratio - a.ratio || b.posts - a.posts);
  return { best: list.slice(0, 8), worst: list.length > 8 ? list.slice(-4).reverse() : [], total: tags.size };
}

// Posts do feed com menos de 72 h que já engajam bem acima da média da conta.
export function trendingPosts(metrics, ads, { now = Date.now() } = {}) {
  const promotedIds = new Set((ads || []).map(a => a.post_id).filter(Boolean));
  const promotedLinks = new Set((ads || []).map(a => normLink(a.permalink)).filter(Boolean));
  const feed = (metrics || []).filter(m => m.posted_at && !isStory(m) && now - new Date(m.posted_at).getTime() <= 30 * 86_400_000);
  return withRatios(feed)
    .filter(m => {
      const age = now - new Date(m.posted_at).getTime();
      return age >= 3_600_000 && age <= 72 * 3_600_000 && m.weighted >= 4 && (m.vsAverage ?? 0) >= 2
        && !promotedIds.has(m.external_id) && !promotedLinks.has(normLink(m.permalink));
    })
    .sort((a, b) => b.vsAverage - a.vsAverage)
    .slice(0, 3)
    .map(m => ({ ...m, vsAverage: round1(m.vsAverage) }));
}

export async function fetchAdsConversion(days = 30) {
  const { data, error } = await db.rpc('admin_marketing_ads', { days_back: days });
  if (error) throw error;
  return (data || []).map(r => ({ source: r.mx_source, content: r.mx_content || '', visits: Number(r.mx_visits), signups: Number(r.mx_signups), activated: Number(r.mx_activated) }));
}

const slug = v => String(v || '').trim().toLowerCase();

// Cadastros de cada anúncio: o utm_content do link é o id ou o nome do anúncio. Também
// devolve o total de cadastros vindos de anúncio (mesmo sem conteúdo identificado) para o
// custo médio por cadastro.
export function adSignups(ads, conv) {
  const byContent = new Map();
  for (const r of conv || []) {
    const k = slug(r.content);
    if (!k) continue;
    const g = byContent.get(k) || { signups: 0, visits: 0, activated: 0 };
    g.signups += r.signups; g.visits += r.visits; g.activated += r.activated;
    byContent.set(k, g);
  }
  const perAd = new Map();
  for (const a of ads || []) perAd.set(a.id, byContent.get(slug(a.id)) || byContent.get(slug(a.name)) || null);
  const totals = (conv || []).reduce((t, r) => ({ signups: t.signups + r.signups, visits: t.visits + r.visits, activated: t.activated + r.activated }), { signups: 0, visits: 0, activated: 0 });
  return { perAd, totals };
}

// Resumo dos últimos 7 dias para acompanhar e copiar (WhatsApp).
export function weeklySummary({ metrics, ads, conversion, now = Date.now() }) {
  const week = (metrics || []).filter(m => m.posted_at && now - new Date(m.posted_at).getTime() <= 7 * 86_400_000);
  const feed = week.filter(m => !isStory(m));
  const interactions = feed.reduce((t, m) => t + (m.likes || 0) + (m.comments || 0) + (m.shares || 0) + (m.saves || 0), 0);
  const reach = feed.reduce((t, m) => t + (m.reach || 0), 0);
  const best = withRatios(feed).sort((a, b) => (b.vsAverage ?? 0) - (a.vsAverage ?? 0))[0] || null;
  const t = adTotals(ads);
  const social = (conversion || []).reduce((n, r) => ({ visits: n.visits + r.visits, signups: n.signups + r.signups }), { visits: 0, signups: 0 });
  return {
    posts: feed.length, stories: week.length - feed.length, interactions, reach, best,
    spend: t.spend, adClicks: t.clicks, adReach: t.reach, signups: social.signups, visits: social.visits,
  };
}
