// Constantes compartilhadas e a chamada às Edge Functions (invoke). (parte de lib/marketing.js, que reexporta tudo).
import { db } from '../supabase';

export const SITE = 'https://eafit.com.br';
export const BUCKET = 'marketing-media';
export const MAX_BYTES = 100 * 1024 * 1024; // igual ao file_size_limit do bucket

export const PLATFORMS = {
  facebook: { label: 'Facebook', limit: 63000 },
  instagram: { label: 'Instagram', limit: 2200 },
  tiktok: { label: 'TikTok', limit: 2200 },
  youtube: { label: 'YouTube', limit: 5000 },
};

export const STATUS_LABEL = {
  pending: 'Na fila', processing: 'Processando na rede', published: 'Publicado', failed: 'Falhou', canceled: 'Cancelado',
};

// Respostas prontas da caixa de comentários ({nome} vira o nome de quem comentou).
export const QUICK_REPLIES = [
  'Valeu, {nome}! 💪 Comece agora: eafit.com.br/app',
  'Oi, {nome}! Dá para baixar direto pelo navegador, no celular ou no computador. Comece agora: eafit.com.br/app',
  'Obrigado pelo carinho, {nome}! Bons treinos 🔥 Comece agora: eafit.com.br/app',
  '{nome}, chama a gente no direct que te ajudamos com isso 😉 Comece agora: eafit.com.br/app',
];


// Erro de função com status != 2xx: o supabase-js só diz "non-2xx"; o motivo
// está no corpo da resposta.
export async function invoke(fn, body) {
  const { data, error } = await db.functions.invoke(fn, { body });
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
