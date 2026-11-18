// Biblioteca de mídia: prints do app, vídeos de exercício, upload e limpeza. (parte de lib/marketing.js, que reexporta tudo).
import { db } from '../supabase';
import { EXERCISE_VIDEOS, videoCredit } from '../appCatalog';
import { BUCKET, MAX_BYTES, SITE } from './common';

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
  return { path, url: publicUrl(path) };
}

export async function removeMedia(item) {
  // Linha primeiro: se o arquivo falhar depois, sobra um arquivo solto, e não um item quebrado na biblioteca.
  const { error: rowErr } = await db.from('marketing_media').delete().eq('id', item.id);
  if (rowErr) throw rowErr;
  const { error } = await db.storage.from(BUCKET).remove([item.storage_path]);
  if (error) throw error;
}

// Limpeza da biblioteca: o que nenhum post na fila (pendente, processando ou que
// falhou e pode ser reenviado) usa mais. Post já publicado ou cancelado não conta:
// a rede guarda a própria cópia. Material de parceiros também é cópia à parte.
export const ACTIVE_TARGET_STATUS = ['pending', 'processing', 'failed'];

export async function fetchMediaInUse() {
  const { data, error } = await db.from('marketing_post_targets')
    .select('status, marketing_posts(media)')
    .in('status', ACTIVE_TARGET_STATUS);
  if (error) throw error;
  return (data || []).flatMap(t => t.marketing_posts?.media || []).map(m => String(m?.url || ''));
}

export function unusedMedia(items, activeUrls) {
  return (items || []).filter(m => m.storage_path && !activeUrls.some(u => u.includes(m.storage_path)));
}

// Remove um a um (mesma ordem do removeMedia: linha, depois arquivo). Segue mesmo se um falhar.
export async function removeMediaBatch(list, remove = removeMedia) {
  const failed = [];
  let done = 0;
  for (const item of list) {
    try {
      await remove(item);
      done += 1;
    } catch (err) {
      failed.push({ item, message: err?.message || String(err) });
    }
  }
  return { done, failed };
}
