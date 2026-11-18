// Editor da fila automática. (parte de lib/marketing.js, que reexporta tudo).
import { db } from '../supabase';
import { laneKey } from './autopost';

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
