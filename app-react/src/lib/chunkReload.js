const CHUNK_RELOAD_KEY = 'eafit:chunk-reload';

// Depois de um deploy novo, uma aba aberta com a versão antiga pode pedir um
// chunk (import dinâmico das páginas) que não existe mais no servidor.
// Recarregar uma vez resolve; a flag em sessionStorage evita loop se o erro
// persistir.
export function isChunkLoadError(error) {
  const msg = String(error?.message || error || '');
  return error?.name === 'ChunkLoadError'
    || /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(msg);
}

export function reloadOnceForChunkError() {
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
  } catch {
    // sessionStorage indisponível (modo privado restrito): recarrega mesmo assim
  }
  window.location.reload();
  return true;
}

// Chamado no boot: libera um novo reload automático no próximo deploy, mas só
// depois do app rodar um tempo — se o erro de chunk acontecer em todo boot,
// limpar a flag na hora criaria um loop de recarregamento.
const CLEAR_AFTER_MS = 15_000;
export function clearChunkReloadFlag() {
  setTimeout(() => {
    try { sessionStorage.removeItem(CHUNK_RELOAD_KEY); } catch { /* ignore */ }
  }, CLEAR_AFTER_MS);
}
