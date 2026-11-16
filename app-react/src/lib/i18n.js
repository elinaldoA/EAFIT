import { seasonText } from './season';

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

// Separador decimal do idioma do app: "2,8" em português, "2.8" em inglês.
export const decimal = (text, language = lang) => (language === 'en' ? String(text) : String(text).replace('.', ','));

// Os dicionários em inglês pesam cerca de 400 KB: só quem usa o app em inglês
// baixa. O await no topo segura os módulos que importam este arquivo até o
// dicionário chegar, então t() continua síncrono (inclusive nas constantes de
// módulo que chamam t() na importação). Em português nada é baixado.
const english = lang === 'en' ? await import('../i18n/en') : null;
const exercises = lang === 'en' ? await import('../i18n/en/exercises') : null;
const dict = english ? english.default : null;


export function t(text, vars) {
  let out = dict?.[text] ?? text;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  // Tema de temporada: emojis de enfeite trocados (lib/season.js)
  return seasonText(out);
}

// Exercícios/planos: o dado fica em português (é a chave do histórico e dos
// recordes); só a exibição traduz. Sem entrada, devolve o texto como veio —
// exercício criado pelo usuário ou pelo personal aparece como foi digitado.
// Prefixo de emoji ("🔷 Prancha", "🏃 Cardio — …") é preservado.
const EMOJI_PREFIX = /^([\p{Extended_Pictographic}\uFE0F\u200D]+\s*)/u;

function viaDict(text, dictionary) {
  if (!dictionary || !text || typeof text !== 'string') return text;
  const m = text.match(EMOJI_PREFIX);
  const prefix = m ? m[1] : '';
  const core = text.slice(prefix.length);
  const hit = dictionary[core];
  return hit ? prefix + hit : text;
}

export const tEx = nome => viaDict(nome, exercises?.names);
export const tTec = tecnica => viaDict(tecnica, exercises?.techniques);

export function tFoco(foco) {
  if (!exercises || !foco || typeof foco !== 'string') return foco;
  if (exercises.focos[foco]) return exercises.focos[foco];
  const parts = foco.split(' / ');
  return parts.map(p => exercises.focoParts[p] ?? p).join(' / ');
}

export function tReps(reps) {
  if (!exercises || !reps || typeof reps !== 'string') return reps;
  return exercises.repsRules.reduce((acc, [re, to]) => acc.replace(re, to), reps);
}

export function setLang(code) {
  if (!LANGS.some(l => l.code === code) || code === lang) return;
  try { localStorage.setItem(STORAGE_KEY, code); } catch { /* sem storage */ }
  window.location.reload();
}

if (typeof document !== 'undefined') document.documentElement.lang = locale;
