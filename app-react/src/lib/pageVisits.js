import { db } from './supabase';
import { todayDate } from '../data/treinoData';
import { lang } from './i18n';
import { readClientInfo } from './clientInfo';

export { detectOS } from './clientInfo';

// Contagem anônima de visitas (tabela public.page_visits — ver
// supabase/migrations/20261002030000_page_visits.sql). A MESMA regra de origem
// e de aparelho (lib/clientInfo.js) está copiada no script do site (public/landing/assets/site.js), que não tem build:
// mudou aqui, mude lá.

const REFERRER_SOURCES = [
  [/(^|\.)google\./, 'google'],
  [/(^|\.)bing\.com$/, 'bing'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, 'facebook'],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'x'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, 'whatsapp'],
  [/(^|\.)linkedin\.com$/, 'linkedin'],
];

// ?origem= (links nossos: card, convite) > ?utm_source= > domínio do referrer.
// Mesma origem do site = veio da landing (ou de outra página nossa).
export function detectSource(search, referrer, ownHost) {
  const params = new URLSearchParams(search || '');
  const tagged = (params.get('origem') || params.get('utm_source') || '').toLowerCase()
    .replace(/[^a-z0-9_-]/g, '').slice(0, 40);
  if (tagged) return tagged;

  let host = '';
  try { host = referrer ? new URL(referrer).hostname.toLowerCase() : ''; } catch { host = ''; }
  if (!host) return 'direto';
  if (host === ownHost) return 'landing';
  const match = REFERRER_SOURCES.find(([re]) => re.test(host));
  return match ? match[1] : 'outro-site';
}

// ?utm_campaign= no formato aceito pelo banco (vazio = sem campanha).
export function detectCampaign(search) {
  const raw = new URLSearchParams(search || '').get('utm_campaign') || '';
  return raw.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
}

// No máximo 1 visita por página por dia neste navegador (aproxima
// "visitantes por dia" sem identificar ninguém). Falha silenciosa: métrica
// nunca pode atrapalhar o app.
export async function recordVisit(page) {
  const key = `eafit_visit_${page}`;
  const today = todayDate();
  try {
    if (localStorage.getItem(key) === today) return false;
    localStorage.setItem(key, today);
  } catch { /* sem armazenamento: conta mesmo assim */ }

  const source = detectSource(window.location.search, document.referrer, window.location.hostname);
  const { os, browser, device } = readClientInfo();
  const campaign = detectCampaign(window.location.search);
  // Do mais completo pro mais simples: banco sem as colunas novas (migration
  // ainda não aplicada) recusa a linha, e a visita é gravada sem elas.
  const attempts = [
    { page, source, os, browser, device, lang, campaign },
    { page, source, os },
    { page, source },
  ];
  try {
    let error;
    for (const row of attempts) {
      ({ error } = await db.from('page_visits').insert(row));
      if (!error) break;
    }
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('recordVisit:', err?.message || err);
    return false;
  }
}
