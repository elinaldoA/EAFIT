import { detectSource } from './pageVisits';

// Origem do cadastro (painel: Análises → Campanhas). Primeiro toque: a
// primeira chegada vinda de fora (utm_source/origem, ou referrer de outro
// site) fica guardada por 30 dias e vai no cadastro em user_metadata.utm. A
// landing guarda com a MESMA chave e regra em public/landing/assets/site.js:
// mudou aqui, mude lá.
const KEY = 'eafit_utm';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const clean = v => String(v ?? '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);

function read(now) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && clean(saved.source) && now - Number(saved.at) < TTL_MS) return saved;
  } catch { /* sem armazenamento ou valor inválido */ }
  return null;
}

// { source, campaign, medium, content } desta chegada, ou null (direto ou
// navegação dentro do site não contam como origem).
export function detectAttribution(search, referrer, ownHost) {
  const source = detectSource(search, referrer, ownHost);
  if (source === 'direto' || source === 'landing') return null;
  const p = new URLSearchParams(search || '');
  return { source, campaign: clean(p.get('utm_campaign')), medium: clean(p.get('utm_medium')), content: clean(p.get('utm_content')) };
}

export function captureAttribution(search = window.location.search, referrer = document.referrer, now = Date.now()) {
  if (read(now)) return;
  const a = detectAttribution(search, referrer, window.location.hostname);
  if (!a) return;
  try { localStorage.setItem(KEY, JSON.stringify({ ...a, at: now })); } catch { /* sem armazenamento */ }
}

export function pendingAttribution(now = Date.now()) {
  const s = read(now);
  return s ? { source: clean(s.source), campaign: clean(s.campaign), medium: clean(s.medium), content: clean(s.content) } : null;
}

export function clearAttribution() {
  try { localStorage.removeItem(KEY); } catch { /* sem armazenamento */ }
}
