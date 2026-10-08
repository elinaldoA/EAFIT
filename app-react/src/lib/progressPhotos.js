import { db } from './supabase';
import { trackFeature } from './tracking';
import { compressImageBlob, assertValidImage } from './imageUtils';

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024; // 5MB — tamanho máximo aceito do arquivo original
const BUCKET = 'progress-photos';
const SIGNED_URL_TTL = 3600; // 1h — só precisa durar o carregamento da tela

// Fotos novas vão pro Storage (storage_path); as antigas ainda têm o base64
// direto na coluna image_data. fetchPhotos normaliza os dois formatos pro
// mesmo campo `image_data` de saída, pra não mudar quem já lê esse campo.
export async function fetchPhotos(userId) {
  const { data, error } = await db
    .from('progress_photos')
    .select('id, photo_date, image_data, storage_path, note')
    .eq('user_id', userId)
    .order('photo_date', { ascending: true });
  if (error) throw error;

  const rows = data || [];
  const withStorage = rows.filter(r => r.storage_path);
  const signedByPath = {};
  if (withStorage.length) {
    const { data: signed, error: signErr } = await db.storage
      .from(BUCKET)
      .createSignedUrls(withStorage.map(r => r.storage_path), SIGNED_URL_TTL);
    if (signErr) throw signErr;
    (signed || []).forEach(s => { if (s.signedUrl) signedByPath[s.path] = s.signedUrl; });
  }

  return rows.map(r => ({
    id: r.id,
    photo_date: r.photo_date,
    note: r.note,
    image_data: r.storage_path ? signedByPath[r.storage_path] : r.image_data,
  }));
}

export async function addPhoto(userId, { file, date, note }) {
  trackFeature('photos');
  assertValidImage(file, MAX_UPLOAD_SIZE);

  const blob = await compressImageBlob(file);
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error: uploadErr } = await db.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
  if (uploadErr) throw uploadErr;

  const { data, error } = await db
    .from('progress_photos')
    .insert({ user_id: userId, photo_date: date, storage_path: path, note: note?.trim() || null })
    .select()
    .single();
  if (error) {
    await db.storage.from(BUCKET).remove([path]);
    throw error;
  }

  const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
  return { id: data.id, photo_date: data.photo_date, note: data.note, image_data: signed?.signedUrl };
}

// Conta sem baixar o base64/URL de cada foto (fetchPhotos seria caro só para contar).
export async function countPhotos(userId) {
  const { count, error } = await db
    .from('progress_photos')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) throw error;
  return count || 0;
}

export async function deletePhoto(id, userId) {
  const { data: photo, error: fetchErr } = await db
    .from('progress_photos')
    .select('storage_path')
    .eq('id', id).eq('user_id', userId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;

  const { error } = await db.from('progress_photos').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;

  if (photo?.storage_path) await db.storage.from(BUCKET).remove([photo.storage_path]);
}
