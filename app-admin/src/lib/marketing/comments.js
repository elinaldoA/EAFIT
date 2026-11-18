// Caixa de comentários e respostas prontas. (parte de lib/marketing.js, que reexporta tudo).
import { db } from '../supabase';
import { invoke } from './common';

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
