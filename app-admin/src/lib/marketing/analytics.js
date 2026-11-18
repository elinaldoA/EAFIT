// Análises: melhores horários, hashtags, posts em alta e resumo semanal. (parte de lib/marketing.js, que reexporta tudo).
import { db } from '../supabase';
import { adTotals, isStory, normLink, weighted } from './ads';

// ---------- análises de marketing ----------

// Engajamento de cada post em relação à média da própria conta (stories à parte).
// Com alcance usa a taxa sobre o alcance; sem alcance, a soma ponderada.
function withRatios(list) {
  const key = m => `${m.account_id}|${isStory(m) ? 'story' : 'feed'}`;
  const groups = new Map();
  for (const m of list) {
    const g = groups.get(key(m)) || { sum: 0, n: 0 };
    g.sum += m.reach > 0 ? weighted(m) / m.reach : weighted(m);
    g.n += 1;
    groups.set(key(m), g);
  }
  return list.map(m => {
    const g = groups.get(key(m));
    const avg = g.sum / g.n;
    const w = weighted(m);
    const own = m.reach > 0 ? w / m.reach : w;
    return { ...m, weighted: w, vsAverage: avg > 0 ? own / avg : null };
  });
}

const round1 = n => Math.round(n * 10) / 10;

// Dia da semana (0 = domingo) e hora do post no horário de Brasília.
function spParts(iso) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', hour12: false }).formatToParts(new Date(iso));
  const get = t => parts.find(p => p.type === t)?.value;
  return { weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')), hour: Number(get('hour')) % 24 };
}

export const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const PERIODS_OF_DAY = [
  { key: 'madrugada', label: 'Madrugada (0h–6h)', from: 0, to: 6 },
  { key: 'manha', label: 'Manhã (6h–11h)', from: 6, to: 11 },
  { key: 'almoco', label: 'Almoço (11h–14h)', from: 11, to: 14 },
  { key: 'tarde', label: 'Tarde (14h–18h)', from: 14, to: 18 },
  { key: 'noite', label: 'Noite (18h–24h)', from: 18, to: 24 },
];

// Em que dia da semana e período do dia os posts do feed engajam mais (horário de Brasília).
// Só aponta como melhor o grupo com `minPosts` posts ou mais.
export function bestTimes(metrics, { now = Date.now(), days = 90, minPosts = 2 } = {}) {
  const feed = (metrics || []).filter(m => m.posted_at && !isStory(m) && now - new Date(m.posted_at).getTime() <= days * 86_400_000);
  const rated = withRatios(feed).filter(m => m.vsAverage !== null).map(m => ({ ...m, ...spParts(m.posted_at) }));
  const group = test => {
    const list = rated.filter(test);
    return { posts: list.length, ratio: list.length ? round1(list.reduce((t, m) => t + m.vsAverage, 0) / list.length) : null };
  };
  const byWeekday = WEEKDAYS.map((label, i) => ({ key: i, label, ...group(m => m.weekday === i) }));
  const byPeriod = PERIODS_OF_DAY.map(p => ({ key: p.key, label: p.label, ...group(m => m.hour >= p.from && m.hour < p.to) }));
  const top = rows => rows.filter(r => r.posts >= minPosts && r.ratio !== null).sort((a, b) => b.ratio - a.ratio)[0] || null;
  return { byWeekday, byPeriod, bestWeekday: top(byWeekday), bestPeriod: top(byPeriod), posts: rated.length };
}

// Hashtags das legendas e o engajamento médio (vs a média da conta) dos posts que as usaram.
export function hashtagStats(metrics, { now = Date.now(), days = 90, minPosts = 2 } = {}) {
  const feed = (metrics || []).filter(m => m.posted_at && !isStory(m) && m.caption && now - new Date(m.posted_at).getTime() <= days * 86_400_000);
  const tags = new Map();
  for (const m of withRatios(feed)) {
    if (m.vsAverage === null) continue;
    const found = new Set((m.caption.match(/#[\p{L}\p{N}_]+/gu) || []).map(t => t.toLowerCase()));
    for (const t of found) {
      const g = tags.get(t) || { tag: t, posts: 0, sum: 0 };
      g.posts += 1;
      g.sum += m.vsAverage;
      tags.set(t, g);
    }
  }
  const list = [...tags.values()].filter(g => g.posts >= minPosts)
    .map(g => ({ tag: g.tag, posts: g.posts, ratio: round1(g.sum / g.posts) }))
    .sort((a, b) => b.ratio - a.ratio || b.posts - a.posts);
  return { best: list.slice(0, 8), worst: list.length > 8 ? list.slice(-4).reverse() : [], total: tags.size };
}

// Posts do feed com menos de 72 h que já engajam bem acima da média da conta.
export function trendingPosts(metrics, ads, { now = Date.now() } = {}) {
  const promotedIds = new Set((ads || []).map(a => a.post_id).filter(Boolean));
  const promotedLinks = new Set((ads || []).map(a => normLink(a.permalink)).filter(Boolean));
  const feed = (metrics || []).filter(m => m.posted_at && !isStory(m) && now - new Date(m.posted_at).getTime() <= 30 * 86_400_000);
  return withRatios(feed)
    .filter(m => {
      const age = now - new Date(m.posted_at).getTime();
      return age >= 3_600_000 && age <= 72 * 3_600_000 && m.weighted >= 4 && (m.vsAverage ?? 0) >= 2
        && !promotedIds.has(m.external_id) && !promotedLinks.has(normLink(m.permalink));
    })
    .sort((a, b) => b.vsAverage - a.vsAverage)
    .slice(0, 3)
    .map(m => ({ ...m, vsAverage: round1(m.vsAverage) }));
}

export async function fetchAdsConversion(days = 30) {
  const { data, error } = await db.rpc('admin_marketing_ads', { days_back: days });
  if (error) throw error;
  return (data || []).map(r => ({ source: r.mx_source, content: r.mx_content || '', visits: Number(r.mx_visits), signups: Number(r.mx_signups), activated: Number(r.mx_activated) }));
}

const slug = v => String(v || '').trim().toLowerCase();

// Cadastros de cada anúncio: o utm_content do link é o id ou o nome do anúncio. Também
// devolve o total de cadastros vindos de anúncio (mesmo sem conteúdo identificado) para o
// custo médio por cadastro.
export function adSignups(ads, conv) {
  const byContent = new Map();
  for (const r of conv || []) {
    const k = slug(r.content);
    if (!k) continue;
    const g = byContent.get(k) || { signups: 0, visits: 0, activated: 0 };
    g.signups += r.signups; g.visits += r.visits; g.activated += r.activated;
    byContent.set(k, g);
  }
  const perAd = new Map();
  for (const a of ads || []) perAd.set(a.id, byContent.get(slug(a.id)) || byContent.get(slug(a.name)) || null);
  const totals = (conv || []).reduce((t, r) => ({ signups: t.signups + r.signups, visits: t.visits + r.visits, activated: t.activated + r.activated }), { signups: 0, visits: 0, activated: 0 });
  return { perAd, totals };
}

// Resumo dos últimos 7 dias para acompanhar e copiar (WhatsApp).
export function weeklySummary({ metrics, ads, conversion, now = Date.now() }) {
  const week = (metrics || []).filter(m => m.posted_at && now - new Date(m.posted_at).getTime() <= 7 * 86_400_000);
  const feed = week.filter(m => !isStory(m));
  const interactions = feed.reduce((t, m) => t + (m.likes || 0) + (m.comments || 0) + (m.shares || 0) + (m.saves || 0), 0);
  const reach = feed.reduce((t, m) => t + (m.reach || 0), 0);
  const best = withRatios(feed).sort((a, b) => (b.vsAverage ?? 0) - (a.vsAverage ?? 0))[0] || null;
  const t = adTotals(ads);
  const social = (conversion || []).reduce((n, r) => ({ visits: n.visits + r.visits, signups: n.signups + r.signups }), { visits: 0, signups: 0 });
  return {
    posts: feed.length, stories: week.length - feed.length, interactions, reach, best,
    spend: t.spend, adClicks: t.clicks, adReach: t.reach, signups: social.signups, visits: social.visits,
  };
}
