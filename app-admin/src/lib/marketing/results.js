// Resultados: métricas e conversão dos posts. (parte de lib/marketing.js, que reexporta tudo).
import { db } from '../supabase';
import { invoke } from './common';

// ---------- resultados ----------
// Desempenho dos posts (marketing_post_metrics, preenchida pela função marketing)
// e cadastros que vieram das redes (admin_marketing_conversion). Migration
// 20270102010000_marketing_results.sql.

export const KIND_LABEL = { reel: 'Reel', carousel: 'Carrossel', image: 'Foto', video: 'Vídeo', text: 'Texto', story: 'Story' };

export const MEDIUM_LABEL = {
  bio: 'Link da bio', story: 'Story', post: 'Legenda ou comentário', ads: 'Anúncio', parceiro: 'Parceiro', '': 'Sem tipo no link',
};

export async function fetchMetrics() {
  const { data, error } = await db.from('marketing_post_metrics')
    .select('account_id, external_id, permalink, caption, kind, thumb_url, posted_at, likes, comments, shares, saves, reach, views, insights_ok, fetched_at')
    .order('posted_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

export function refreshMetrics() {
  return invoke('marketing', { action: 'metrics' });
}

export async function fetchConversion(days = 30) {
  const { data, error } = await db.rpc('admin_marketing_conversion', { days_back: days });
  if (error) throw error;
  return (data || []).map(r => ({
    source: r.mc_source, medium: r.mc_medium, visits: Number(r.mc_visits), signups: Number(r.mc_signups),
    confirmed: Number(r.mc_confirmed), activated: Number(r.mc_activated),
    mature: Number(r.mc_mature || 0), retained: Number(r.mc_retained || 0),
  }));
}

// Cadastros e retenção por post com link marcado com utm_content (Facebook).
export async function fetchContentConversion(days = 30) {
  const { data, error } = await db.rpc('admin_marketing_content', { days_back: days });
  if (error) throw error;
  return (data || []).map(r => ({
    source: r.mx_source, content: r.mx_content, caption: r.mx_caption || '', visits: Number(r.mx_visits), signups: Number(r.mx_signups),
    activated: Number(r.mx_activated), mature: Number(r.mx_mature), retained: Number(r.mx_retained),
  }));
}

// Pontuação para ranquear posts: alcance quando a rede deu; senão visualizações;
// senão a soma das interações. Assim posts sem insights ainda entram na lista.
export function postScore(m) {
  const interactions = (m.likes || 0) + (m.comments || 0) + (m.shares || 0) + (m.saves || 0);
  return m.reach ?? m.views ?? interactions;
}

// Média de alcance (ou interações, sem insights) por formato: mostra o que rende mais.
export function averageByKind(rows) {
  const groups = new Map();
  for (const m of rows) {
    const g = groups.get(m.kind) || { kind: m.kind, posts: 0, score: 0, interactions: 0 };
    g.posts += 1;
    g.score += postScore(m);
    g.interactions += (m.likes || 0) + (m.comments || 0) + (m.shares || 0) + (m.saves || 0);
    groups.set(m.kind, g);
  }
  return [...groups.values()]
    .map(g => ({ ...g, average: Math.round(g.score / g.posts), averageInteractions: Math.round(g.interactions / g.posts) }))
    .sort((a, b) => b.average - a.average);
}

// Cadastros por visita, em %, com uma casa (null sem visitas).
export function conversionRate(visits, signups) {
  return visits > 0 ? Math.round((signups / visits) * 1000) / 10 : null;
}
