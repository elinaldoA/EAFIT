// Título da aba do navegador por tela ("Água · EAFIT"). O app troca de tela pelo
// hash, sem recarregar, e o título ficava sempre "EAFIT — Treino": no histórico
// do navegador, na lista de abas e para o leitor de tela anunciar a tela nova.
export function pageTitle(label, brand) {
  return label ? `${label} · ${brand}` : null;
}

export function setPageTitle(label, brand, fallback) {
  if (typeof document === 'undefined') return;
  document.title = pageTitle(label, brand) || fallback;
}
