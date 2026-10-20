import { db } from './supabase';
import { locale, t } from './i18n';

// Material de divulgação do influenciador (logos, prints, vídeos, PDFs), que a
// equipe sobe no painel admin. Bucket privado: o download é por URL assinada,
// que vale poucos minutos. supabase/migrations/20261121010000_promo_materials.sql.
const BUCKET = 'promo-materials';
const URL_TTL = 300;

export async function fetchPromoMaterials() {
  const { data, error } = await db.from('promo_materials')
    .select('id, title, description, storage_path, file_name, mime_type, size_bytes, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export function materialIcon(mime) {
  const m = String(mime || '');
  if (m.startsWith('image/')) return '🖼️';
  if (m.startsWith('video/')) return '🎬';
  if (m === 'application/pdf') return '📄';
  return '📦';
}

export function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024 * 1024) return t('{n} KB', { n: Math.max(1, Math.round(n / 1024)) });
  return t('{n} MB', { n: (n / (1024 * 1024)).toLocaleString(locale, { maximumFractionDigits: 1 }) });
}

// Abre o download do arquivo com o nome original.
export async function downloadPromoMaterial(item, doc = document) {
  const { data, error } = await db.storage.from(BUCKET)
    .createSignedUrl(item.storage_path, URL_TTL, { download: item.file_name });
  if (error) throw error;
  const a = doc.createElement('a');
  a.href = data.signedUrl;
  a.rel = 'noopener';
  doc.body.appendChild(a);
  a.click();
  a.remove();
}
