import en from '../i18n/en';
import { names as exNames, techniques as exTec, focos as exFocos, focoParts, repsRules } from '../i18n/en/exercises';

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

// Exercícios/planos: o dado fica em português (é a chave do histórico e dos
// recordes); só a exibição traduz. Sem entrada, devolve o texto como veio —
// exercício criado pelo usuário ou pelo personal aparece como foi digitado.
// Prefixo de emoji ("🔷 Prancha", "🏃 Cardio — …") é preservado.
const EMOJI_PREFIX = /^([\p{Extended_Pictographic}\uFE0F\u200D]+\s*)/u;

function viaDict(text, dictionary) {
  if (lang !== 'en' || !text || typeof text !== 'string') return text;
  const m = text.match(EMOJI_PREFIX);
  const prefix = m ? m[1] : '';
  const core = text.slice(prefix.length);
  const hit = dictionary[core];
  return hit ? prefix + hit : text;
}

export const tEx = nome => viaDict(nome, exNames);
export const tTec = tecnica => viaDict(tecnica, exTec);

export function tFoco(foco) {
  if (lang !== 'en' || !foco || typeof foco !== 'string') return foco;
  if (exFocos[foco]) return exFocos[foco];
  const parts = foco.split(' / ');
  return parts.map(p => focoParts[p] ?? p).join(' / ');
}

export function tReps(reps) {
  if (lang !== 'en' || !reps || typeof reps !== 'string') return reps;
  return repsRules.reduce((acc, [re, to]) => acc.replace(re, to), reps);
}

export function setLang(code) {
  if (!LANGS.some(l => l.code === code) || code === lang) return;
  try { localStorage.setItem(STORAGE_KEY, code); } catch { /* sem storage */ }
  window.location.reload();
}

if (typeof document !== 'undefined') document.documentElement.lang = locale;
