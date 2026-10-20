import { db } from './supabase';
import { todayDate } from '../data/treinoData';
import { lang } from './i18n';
import { readClientInfo } from './clientInfo';
import { isStaffDevice } from './staffDevice';

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

// ?ref= de link de embaixador no formato aceito pelo banco (vazio = sem código).
export function detectRef(search) {
  const code = String(new URLSearchParams(search || '').get('ref') ?? '').trim().toLowerCase();
  return /^[a-z0-9-]{3,30}$/.test(code) ? code : '';
}

// ?personal= de link de convite do personal (códigos como P1A2B3; vazio = sem código).
export function detectPersonal(search) {
  const code = String(new URLSearchParams(search || '').get('personal') ?? '').trim().toUpperCase();
  return /^[A-Z0-9]{4,12}$/.test(code) ? code : '';
}

// No máximo 1 visita por página por dia neste navegador (aproxima
// "visitantes por dia" sem identificar ninguém); link de embaixador ou de
// personal conta à parte, pra não sumir o clique de quem já tinha visitado no dia. Falha
// silenciosa: métrica nunca pode atrapalhar o app. Navegador de admin não conta.
export async function recordVisit(page) {
  if (isStaffDevice()) return false;
  const ref = detectRef(window.location.search);
  const personal = detectPersonal(window.location.search);
  const tag = [ref, personal].filter(Boolean).join('_');
  const key = tag ? `eafit_visit_${page}_${tag}` : `eafit_visit_${page}`;
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
    ...(personal ? [{ page, source, os, browser, device, lang, campaign, ...(ref ? { ref } : {}), personal }] : []),
    ...(ref ? [{ page, source, os, browser, device, lang, campaign, ref }] : []),
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
