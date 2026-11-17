// Cor da barra de status/do navegador (<meta name="theme-color">): acompanha o
// tema do app. Sem isso ela ficava escura mesmo no tema claro, com uma faixa
// preta em cima de uma tela clara. Os valores são o --bg de cada tema (styles/tokens.css).
export const THEME_COLOR = { dark: '#0e0e12', light: '#f4f4f5' };

export function baseThemeColor() {
  const light = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light';
  return light ? THEME_COLOR.light : THEME_COLOR.dark;
}

// Com um tema de temporada ligado a cor é a dele (lib/season.js).
export function applyThemeColor() {
  if (typeof document === 'undefined') return;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta || document.documentElement.hasAttribute('data-season')) return;
  meta.setAttribute('content', baseThemeColor());
}
