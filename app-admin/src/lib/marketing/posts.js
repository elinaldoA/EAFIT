// Posts: validação, regras do TikTok, criação, edição e fila de envio. (parte de lib/marketing.js, que reexporta tudo).
import { db } from '../supabase';
import { PLATFORMS, invoke } from './common';

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

// Posts agendados para o futuro com alvo ainda pendente, sem o corte dos mais recentes de
// fetchPosts: quem agenda muitos de uma vez (ex.: roteiro de destaques) não pode sumir da agenda.
export async function fetchScheduledPosts(limit = 300) {
  const { data, error } = await db.from('marketing_posts')
    .select('id, caption, media, format, scheduled_at, created_at, marketing_post_targets!inner(id, account_id, status, permalink, error, published_at)')
    .gt('scheduled_at', new Date().toISOString())
    .eq('marketing_post_targets.status', 'pending')
    .order('scheduled_at')
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
