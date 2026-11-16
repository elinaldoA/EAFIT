// Sinal fraco (1 barra na academia) faz a requisição ficar pendurada em vez de
// falhar: o catch nunca roda, a escrita não entra na fila de pendências e o
// ponto de sincronização continua verde. Com prazo, ela vira erro e cai na fila.
//
// Só as rotas de dados e de login têm prazo. Envio de arquivo (storage) e
// funções (OCR, IA) podem levar mais, então ficam como estavam.
export const REQUEST_TIMEOUT_MS = 10000;

function hasDeadline(url) {
  const path = String(typeof url === 'string' ? url : url?.url || '');
  return path.includes('/rest/v1/') || path.includes('/auth/v1/');
}

export function createTimeoutFetch(baseFetch, timeoutMs = REQUEST_TIMEOUT_MS) {
  return (url, options = {}) => {
    const base = (u, o) => baseFetch(u, { ...o, keepalive: true });
    if (!hasDeadline(url)) return base(url, options);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
    // Respeita um cancelamento que o chamador já tenha pedido.
    const outer = options.signal;
    if (outer) {
      if (outer.aborted) controller.abort(outer.reason);
      else outer.addEventListener('abort', () => controller.abort(outer.reason), { once: true });
    }
    return base(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
  };
}
