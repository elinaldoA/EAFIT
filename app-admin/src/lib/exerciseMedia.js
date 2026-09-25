import { db } from './supabase';
// Demonstração padrão que o app já mostra sem mídia própria (vídeo curto ou 2
// quadros) — mesma fonte do app, pra não divergir.
import { EXERCISE_VIDEOS } from '../../../app-react/src/data/exerciseVideos.js';
import { EXERCISE_MEDIA, normalizeExerciseName } from '../../../app-react/src/data/exerciseMedia.js';

// Mídia própria de demonstração de execução (tabela exercise_media + bucket
// público exercise-media — ver supabase/migrations/20260925040000_exercise_media.sql).
// O app (app-react/src/lib/customExerciseMedia.js) usa essa mídia no lugar da
// demonstração padrão do Free Exercise DB.
export const BUCKET = 'exercise-media';
export const MAX_BYTES = 15 * 1024 * 1024; // igual ao file_size_limit do bucket

const TYPES = {
  'image/gif': { ext: 'gif', kind: 'imagem' },
  'image/webp': { ext: 'webp', kind: 'imagem' },
  'image/png': { ext: 'png', kind: 'imagem' },
  'image/jpeg': { ext: 'jpg', kind: 'imagem' },
  'video/mp4': { ext: 'mp4', kind: 'video' },
  'video/webm': { ext: 'webm', kind: 'video' },
};
export const ACCEPT = Object.keys(TYPES).join(',');

// Mesmo critério do app (normalizeExerciseName): planos antigos prefixam emoji
// nos exercícios de pós-treino.
export const normalizeName = normalizeExerciseName;

// 'video' | 'imagens' | null
export function defaultDemoFor(nome) {
  const key = normalizeName(nome);
  if (EXERCISE_VIDEOS[key]) return 'video';
  return EXERCISE_MEDIA[key] ? 'imagens' : null;
}

export function validateMediaFile(file) {
  if (!file) return 'Nenhum arquivo selecionado.';
  if (!TYPES[file.type]) return 'Formato não aceito. Use GIF, WebP, PNG, JPG, MP4 ou WebM.';
  if (file.size > MAX_BYTES) return `Arquivo com ${(file.size / 1024 / 1024).toFixed(1)}MB — o limite é 15MB.`;
  return null;
}

// Nome novo a cada envio (sufixo de tempo): o app guarda a mídia em cache
// pela URL, então trocar o arquivo mantendo o nome serviria a versão antiga.
export function storagePathFor(nome, file, now = Date.now()) {
  const slug = normalizeName(nome)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 60) || 'exercicio';
  return `${slug}-${now}.${TYPES[file.type].ext}`;
}

export function mediaKindFor(file) {
  return TYPES[file.type]?.kind ?? null;
}

// Linhas da tela: todos os exercícios da biblioteca + nomes que só existem em
// exercise_media (variações usadas em planos, fora da biblioteca).
export function buildRows(library, media) {
  const mediaByName = new Map((media || []).map(m => [m.nome, m]));
  const row = (nome, grupo, m) => ({ nome, grupo, media: m, padrao: defaultDemoFor(nome) });
  const rows = (library || []).map(l => row(l.nome, l.grupo_muscular, mediaByName.get(l.nome) || null));
  const known = new Set(rows.map(r => r.nome));
  (media || []).forEach(m => { if (!known.has(m.nome)) rows.push(row(m.nome, null, m)); });
  return rows.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function publicUrl(path) {
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function fetchMediaScreen() {
  const [lib, media] = await Promise.all([
    db.from('exercise_library').select('nome, grupo_muscular').order('nome'),
    db.from('exercise_media').select('nome, storage_path, media_type, updated_at'),
  ]);
  if (lib.error) throw lib.error;
  if (media.error) throw media.error;
  return buildRows(lib.data, media.data);
}

async function audit(adminId, action, details) {
  const { error } = await db.from('admin_audit_log').insert({ admin_id: adminId, target_user_id: null, action, details });
  if (error) console.warn('admin_audit_log:', error);
}

export async function uploadExerciseMedia({ nome, file, previousPath, adminId }) {
  const path = storagePathFor(nome, file);
  const { error: upErr } = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;

  const { error } = await db.from('exercise_media').upsert({
    nome, storage_path: path, media_type: mediaKindFor(file),
    updated_at: new Date().toISOString(), updated_by: adminId,
  }, { onConflict: 'nome' });
  if (error) {
    await db.storage.from(BUCKET).remove([path]); // não deixa arquivo órfão
    throw error;
  }
  // O arquivo antigo só sai depois que a linha já aponta pro novo.
  if (previousPath) await db.storage.from(BUCKET).remove([previousPath]);
  await audit(adminId, previousPath ? 'exerciseMediaReplace' : 'exerciseMediaUpload', { nome, path });
}

export async function removeExerciseMedia({ nome, path, adminId }) {
  const { error } = await db.from('exercise_media').delete().eq('nome', nome);
  if (error) throw error;
  await db.storage.from(BUCKET).remove([path]);
  await audit(adminId, 'exerciseMediaRemove', { nome, path });
}
