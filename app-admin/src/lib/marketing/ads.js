// Posts promovidos (anúncios). (parte de lib/marketing.js, que reexporta tudo).
import { invoke } from './common';

export function fetchAds(days = 30) {
  return invoke('marketing', { action: 'ads', days });
}

export const AD_STATUS_LABEL = {
  ACTIVE: 'No ar', PAUSED: 'Pausado', CAMPAIGN_PAUSED: 'Campanha pausada', ADSET_PAUSED: 'Conjunto pausado',
  PENDING_REVIEW: 'Em análise', IN_PROCESS: 'Em análise', DISAPPROVED: 'Reprovado', WITH_ISSUES: 'Com problema',
  ARCHIVED: 'Arquivado', DELETED: 'Excluído',
};

// Gasto, alcance, cliques e custos de uma lista de anúncios (custos nulos quando não há base).
export function adTotals(ads) {
  const t = (ads || []).reduce((a, r) => ({
    spend: a.spend + r.spend, reach: a.reach + r.reach, impressions: a.impressions + r.impressions,
    clicks: a.clicks + r.clicks, results: a.results + r.results,
  }), { spend: 0, reach: 0, impressions: 0, clicks: 0, results: 0 });
  return { ...t, cpc: t.clicks ? t.spend / t.clicks : null, cpm: t.impressions ? (t.spend / t.impressions) * 1000 : null, cpr: t.results ? t.spend / t.results : null };
}

// O anúncio de um Reel devolve /p/CODIGO e o post tem /reel/CODIGO: o que vale é o código (e o id no Facebook).
export const normLink = u => String(u || '').split('?')[0].replace(/\/+$/, '').split('/').pop().toLowerCase();
export const isStory = m => m.kind === 'story';
// Story não tem curtida: o que pesa é conversa (respostas) e compartilhamento.
export const weighted = m => (isStory(m)
  ? 3 * (m.comments || 0) + 3 * (m.shares || 0)
  : (m.likes || 0) + 2 * (m.comments || 0) + 3 * (m.saves || 0) + 3 * (m.shares || 0));

// Posts orgânicos recentes com mais chance de render bem se forem promovidos: os que mais
// engajaram em relação à média da própria conta (curtidas, comentários x2, salvos e
// compartilhamentos x3; com alcance, a taxa sobre o alcance), sem os que já têm anúncio.
// Stories entram à parte (comparados só com outros stories) e, se ainda estão no ar
// (menos de 24 h), vêm com `live` e o horário em que saem: só dá para impulsionar até lá.
// `confidence` fica 'baixa' quando a base é pequena (sem alcance ou poucas interações).
// `kind` ('' = todos) filtra o formato.
export function promoCandidates(metrics, ads, { now = Date.now(), days = 30, limit = 5, kind = '' } = {}) {
  const promotedIds = new Set((ads || []).map(a => a.post_id).filter(Boolean));
  const promotedLinks = new Set((ads || []).map(a => normLink(a.permalink)).filter(Boolean));
  const recent = (metrics || []).filter(m => {
    if (!m.posted_at) return false;
    const age = now - new Date(m.posted_at).getTime();
    return age >= (isStory(m) ? 0 : 86_400_000) && age <= days * 86_400_000;
  });
  const groupKey = m => `${m.account_id}|${isStory(m) ? 'story' : 'feed'}`;
  const groups = new Map();
  for (const m of recent) {
    const g = groups.get(groupKey(m)) || { sum: 0, n: 0 };
    g.sum += m.reach > 0 ? weighted(m) / m.reach : weighted(m);
    g.n += 1;
    groups.set(groupKey(m), g);
  }
  return recent
    .filter(m => (!kind || m.kind === kind) && !promotedIds.has(m.external_id) && !promotedLinks.has(normLink(m.permalink)))
    .map(m => {
      const w = weighted(m);
      const rate = m.reach > 0 ? w / m.reach : null;
      const g = groups.get(groupKey(m));
      const avg = g.sum / g.n;
      const own = rate ?? w;
      const liveUntil = isStory(m) && now - new Date(m.posted_at).getTime() < 86_400_000 ? new Date(new Date(m.posted_at).getTime() + 86_400_000).toISOString() : null;
      return {
        ...m, weighted: w, rate: rate === null ? null : Math.round(rate * 1000) / 10,
        vsAverage: avg > 0 ? Math.round((own / avg) * 10) / 10 : null, liveUntil,
        confidence: m.reach > 0 && w >= 10 ? 'ok' : 'baixa',
      };
    })
    .filter(m => m.weighted >= (isStory(m) ? 1 : 2))
    .sort((a, b) => (b.vsAverage ?? 0) - (a.vsAverage ?? 0) || b.weighted - a.weighted)
    .slice(0, limit);
}
