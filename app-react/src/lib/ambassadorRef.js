import { detectSource, detectRef } from './pageVisits';

// Link de embaixador (https://eafit.com.br/app/?ref=CODIGO; links antigos
// apontam para o site, que guarda igual): o código fica
// guardado no navegador e vai no cadastro (user_metadata.ref), onde o banco
// vincula a conta ao embaixador — ver
// supabase/migrations/20261108010000_ambassadors.sql. A landing guarda com a
// MESMA regra e chave em public/landing/assets/site.js: mudou aqui, mude lá.

const KEY = 'eafit_ref';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const normalizeRef = value => detectRef(`?ref=${encodeURIComponent(String(value ?? ''))}`);

function read(now) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && normalizeRef(saved.code) && now - Number(saved.at) < TTL_MS) return saved;
  } catch { /* sem armazenamento ou valor inválido */ }
  return null;
}

// Chamado ao abrir o app. O primeiro link vale por 30 dias: outro ?ref= nesse
// período não troca o embaixador.
export function captureRef(search = window.location.search, referrer = document.referrer, now = Date.now()) {
  const code = detectRef(search);
  if (!code || read(now)) return;
  const source = detectSource(search, referrer, window.location.hostname);
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, source, at: now }));
  } catch { /* sem armazenamento: o vínculo se perde, o app segue */ }
}

// { code, source } ainda válido, ou null.
export function pendingRef(now = Date.now()) {
  const saved = read(now);
  return saved ? { code: normalizeRef(saved.code), source: String(saved.source || 'direto') } : null;
}

export function clearRef() {
  try { localStorage.removeItem(KEY); } catch { /* sem armazenamento */ }
}
