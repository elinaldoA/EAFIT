import { db } from './supabase';
import { todayDate } from '../data/treinoData';

// Contagem anônima de visitas (tabela public.page_visits — ver
// supabase/migrations/20261002030000_page_visits.sql). A MESMA regra de origem
// e de sistema operacional está copiada no <script> de public/landing/index.html, que não tem build:
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

// Família do sistema operacional, só pra estatística agregada do painel (o
// user-agent em si nunca é gravado). Android antes de Linux: todo Android se
// declara Linux. iPad recente se apresenta como Mac — o que o diferencia é ter
// tela de toque.
export function detectOS(userAgent, platform, maxTouchPoints) {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) return 'outro';
  if (ua.includes('android')) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  const mac = ua.includes('macintosh') || ua.includes('mac os x') || /^mac/i.test(platform || '');
  if (mac) return maxTouchPoints > 1 ? 'ios' : 'mac';
  if (ua.includes('windows')) return 'windows';
  if (ua.includes('cros')) return 'outro';
  if (ua.includes('linux') || ua.includes('x11')) return 'linux';
  return 'outro';
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
  const nav = typeof navigator === 'undefined' ? {} : navigator;
  const os = detectOS(nav.userAgent, nav.platform, nav.maxTouchPoints);
  try {
    let { error } = await db.from('page_visits').insert({ page, source, os });
    // Banco ainda sem a coluna `os` (migration não aplicada): grava como antes.
    if (error) ({ error } = await db.from('page_visits').insert({ page, source }));
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('recordVisit:', err?.message || err);
    return false;
  }
}
