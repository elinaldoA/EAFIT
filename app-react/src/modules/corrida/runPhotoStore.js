import { db } from '../../lib/supabase';
import { compressImageBlob, assertValidImage } from '../../lib/imageUtils';
import { trackFeature } from '../../lib/tracking';

// Fotos na corrida: até 4 por corrida, no bucket privado run-photos (pasta
// <dono>/<corrida>/<arquivo>.jpg). Quem vê: o dono e os amigos, quando a corrida é
// para amigos (migration 20270305160000). Os arquivos só abrem por link assinado.

export const RUN_PHOTO_BUCKET = 'run-photos';
export const MAX_RUN_PHOTOS = 4;
const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;
const SIGNED_URL_TTL = 3600;

// Fotos das corridas `runIds`: Map corrida → [{ id, path }], da mais antiga à mais nova.
// Sem a tabela (migration ainda não aplicada) devolve um Map vazio.
export async function fetchRunPhotos(runIds) {
  const ids = [...new Set((runIds || []).filter(Boolean))];
  const out = new Map();
  if (!ids.length) return out;
  const { data, error } = await db.from('run_photos').select('id, run_id, storage_path, created_at').in('run_id', ids).order('created_at', { ascending: true });
  if (error) return out;
  for (const r of data || []) {
    if (!out.has(r.run_id)) out.set(r.run_id, []);
    out.get(r.run_id).push({ id: r.id, path: r.storage_path });
  }
  return out;
}

// Links assinados: { caminho: url }. Foto que não abre (sem permissão, apagada) fica de fora.
export async function signPhotoUrls(paths) {
  const list = [...new Set((paths || []).filter(Boolean))];
  if (!list.length) return {};
  const { data, error } = await db.storage.from(RUN_PHOTO_BUCKET).createSignedUrls(list, SIGNED_URL_TTL);
  if (error) return {};
  const out = {};
  (data || []).forEach(s => { if (s.signedUrl) out[s.path] = s.signedUrl; });
  return out;
}

// Sobe uma foto (reduzida e comprimida) e a registra na corrida. Só corrida já salva no servidor (run.id).
// Devolve { id, path }; erros: 'run_photos_max' (4 fotos) e os de arquivo inválido (assertValidImage).
export async function addRunPhoto(userId, run, file) {
  if (!run?.id) throw new Error('run_not_saved');
  assertValidImage(file, MAX_UPLOAD_SIZE);
  trackFeature('run_photo');
  const blob = await compressImageBlob(file);
  const path = `${userId}/${run.id}/${crypto.randomUUID()}.jpg`;
  const { error: uploadErr } = await db.storage.from(RUN_PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
  if (uploadErr) throw uploadErr;
  const { data, error } = await db.from('run_photos').insert({ user_id: userId, run_id: run.id, storage_path: path }).select('id').single();
  if (error) {
    await db.storage.from(RUN_PHOTO_BUCKET).remove([path]);
    throw error;
  }
  return { id: data.id, path };
}

export async function deleteRunPhoto(userId, photo) {
  const { error } = await db.from('run_photos').delete().eq('id', photo.id).eq('user_id', userId);
  if (error) throw error;
  await db.storage.from(RUN_PHOTO_BUCKET).remove([photo.path]);
}

export const isPhotoLimit = err => err?.message === 'run_photos_max' || /run_photos_max/.test(err?.message || '');
