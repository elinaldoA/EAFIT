import { db } from './supabase';

const BUCKET = 'progress-photos';
const SIGNED_URL_TTL = 3600;

export async function fetchSharePhotos() {
  const { data, error } = await db.rpc('my_share_photos');
  if (error) throw error;
  return !!data;
}

export async function setSharePhotos(share) {
  const { error } = await db.rpc('set_share_photos', { p_share: !!share });
  if (error) throw error;
}

// Antes/depois: primeira e última foto (precisa de pelo menos duas).
export function beforeAfter(photos) {
  if (!photos || photos.length < 2) return null;
  return { before: photos[0], after: photos[photos.length - 1] };
}

// Fotos que o aluno compartilhou com o personal. `shared: false` = o aluno
// não autorizou. As URLs são assinadas (1h).
export async function fetchClientPhotos(clientId) {
  const { data, error } = await db.rpc('trainer_client_photos', { p_client: clientId });
  if (error) throw error;
  const rows = data || [];
  const shared = rows.length > 0 && rows[0].ph_shared === true;
  const photos = rows.filter(r => r.ph_id);
  if (!shared || photos.length === 0) return { shared, photos: [] };

  const { data: signed, error: signErr } = await db.storage.from(BUCKET).createSignedUrls(photos.map(r => r.ph_path), SIGNED_URL_TTL);
  if (signErr) throw signErr;
  const byPath = {};
  (signed || []).forEach(s => { if (s.signedUrl) byPath[s.path] = s.signedUrl; });
  return {
    shared,
    photos: photos
      .filter(r => byPath[r.ph_path])
      .map(r => ({ id: r.ph_id, date: r.ph_date, note: r.ph_note, url: byPath[r.ph_path] })),
  };
}
