import { db } from './supabase';

// Material de divulgação dos influenciadores: o arquivo vai para o bucket
// privado promo-materials e a linha para public.promo_materials (o app baixa
// por URL assinada). Subir e remover é da área 'content' (admin_can).
// supabase/migrations/20261121010000_promo_materials.sql.
export const BUCKET = 'promo-materials';
export const MAX_BYTES = 50 * 1024 * 1024; // igual ao file_size_limit do bucket

// Mesma lista do allowed_mime_types do bucket.
const TYPES = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml',
  'video/mp4', 'video/quicktime', 'video/webm',
  'application/pdf', 'application/zip',
];
export const ACCEPT = TYPES.join(',');

export function validatePromoFile(file) {
  if (!file) return 'Escolha um arquivo.';
  if (!TYPES.includes(file.type)) return 'Formato não aceito: use imagem (PNG, JPG, WebP, GIF, SVG), vídeo (MP4, MOV, WebM), PDF ou ZIP.';
  if (file.size > MAX_BYTES) return 'Arquivo maior que 50 MB.';
  return '';
}

// "Logo EAFIT (fundo escuro).PNG" -> "1729430000000-logo-eafit-fundo-escuro.png"
export function storagePathFor(file, now = Date.now()) {
  const name = String(file.name || 'arquivo');
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const base = (dot > 0 ? name.slice(0, dot) : name).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'arquivo';
  return `${now}-${base}${ext ? `.${ext}` : ''}`;
}

export function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

export async function fetchPromoMaterials() {
  const { data, error } = await db.from('promo_materials')
    .select('id, title, description, storage_path, file_name, mime_type, size_bytes, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function audit(adminId, action, details) {
  const { error } = await db.from('admin_audit_log').insert({ admin_id: adminId, target_user_id: null, action, details });
  if (error) console.warn('admin_audit_log:', error);
}

export async function uploadPromoMaterial({ title, description, file, adminId }) {
  const path = storagePathFor(file);
  const { error: upErr } = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;

  const { error } = await db.from('promo_materials').insert({
    title: title.trim(), description: description.trim(), storage_path: path,
    file_name: String(file.name).slice(0, 120), mime_type: file.type, size_bytes: file.size, created_by: adminId,
  });
  if (error) {
    await db.storage.from(BUCKET).remove([path]); // não deixa arquivo órfão
    throw error;
  }
  await audit(adminId, 'promoMaterialUpload', { title: title.trim(), path });
}

export async function removePromoMaterial({ item, adminId }) {
  const { error } = await db.from('promo_materials').delete().eq('id', item.id);
  if (error) throw error;
  await db.storage.from(BUCKET).remove([item.storage_path]);
  await audit(adminId, 'promoMaterialRemove', { title: item.title, path: item.storage_path });
}

// Para o admin conferir o arquivo antes de divulgar.
export async function promoMaterialUrl(item) {
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(item.storage_path, 300);
  if (error) throw error;
  return data.signedUrl;
}
