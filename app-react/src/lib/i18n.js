import en from '../i18n/en';

// Textos da interface usam o próprio português como chave: 'Iniciar treino'.
// Sem tradução (ou em português) devolve o texto original, então nada quebra
// se uma chave faltar. O idioma vale da carga da página: trocar recarrega o
// app, o que também cobre constantes de módulo avaliadas na importação.
// Placeholders: 'Treino de {dia}'.

export const LANGS = [
  { code: 'pt', label: 'Português', locale: 'pt-BR' },
  { code: 'en', label: 'English', locale: 'en-US' },
];

const STORAGE_KEY = 'app_lang';

function readLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGS.some(l => l.code === saved)) return saved;
  } catch { /* sem storage: fica no padrão */ }
  return 'pt';
}

export const lang = readLang();
export const locale = LANGS.find(l => l.code === lang).locale;

const dict = lang === 'en' ? en : null;

export function t(text, vars) {
  let out = dict?.[text] ?? text;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return out;
}

export function setLang(code) {
  if (!LANGS.some(l => l.code === code) || code === lang) return;
  try { localStorage.setItem(STORAGE_KEY, code); } catch { /* sem storage */ }
  window.location.reload();
}

if (typeof document !== 'undefined') document.documentElement.lang = locale;
