import { db } from './supabase';
import { todayDate } from '../data/treinoData';

// Contagem anônima de visitas (tabela public.page_visits — ver
// supabase/migrations/20261002030000_page_visits.sql). A MESMA regra de origem
// está copiada no <script> de public/landing/index.html, que não tem build:
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
  try {
    const { error } = await db.from('page_visits').insert({ page, source });
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('recordVisit:', err?.message || err);
    return false;
  }
}
