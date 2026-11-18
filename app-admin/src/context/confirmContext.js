import { createContext, useContext } from 'react';

// confirm({ title, message, confirmLabel, danger, requireText, reauth })
// ou confirm('texto')  -> Promise<boolean>. Sem provider (testes de páginas
// soltas) cai no window.confirm, então telas migradas continuam funcionando sozinhas.
export const ConfirmContext = createContext(null);

// Texto solto vira { message }; ações que apagam/removem ganham botão vermelho.
export function normalizeConfirm(opts) {
  if (typeof opts !== 'string') return opts || {};
  return { message: opts, danger: /^(excluir|apagar|remover|desfazer|desconectar|bloquear|cancelar)/i.test(opts) };
}

export function useConfirm() {
  const ask = useContext(ConfirmContext);
  if (ask) return ask;
  return async opts => {
    const { title, message } = normalizeConfirm(opts);
    return window.confirm([title, message].filter(Boolean).join('\n\n'));
  };
}
